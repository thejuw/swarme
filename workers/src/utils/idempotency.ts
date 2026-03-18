/**
 * ============================================================
 * Swarme — Phase 62: Global Idempotency Ledger
 * ============================================================
 *
 * Guarantees exactly-once execution for all autonomous agent
 * tasks. Every background worker MUST call `claimIdempotencyKey`
 * before performing a side-effecting action. If the key already
 * exists with status 'completed', the function returns false and
 * the worker must abort immediately.
 *
 * Key generation uses a deterministic SHA-256 hash of:
 *   domain_id + task_type + unique_discriminator + time_window
 *
 * Examples:
 *   - Decay reversal:  hash(domain_id + "decay_reversal" + article_url + "2026-W12")
 *   - Outreach email:  hash(domain_id + "outreach_email" + contact_email + "2026-03")
 *   - Social draft:    hash(domain_id + "social_draft" + article_id + "2026-03-18")
 *
 * The time_window parameter prevents the same task from being
 * permanently blocked. Once the window rolls over (e.g., next
 * week for weekly tasks), a new key is generated and the task
 * becomes eligible again.
 *
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface IdempotencyClaimResult {
  /** Whether the key was successfully claimed (i.e., this worker owns it) */
  claimed: boolean;
  /** If not claimed, the reason why */
  reason?: "already_completed" | "already_processing" | "insert_failed";
  /** The generated key (for later marking complete/failed) */
  key: string;
}

export interface IdempotencyKeyRow {
  idempotency_key: string;
  domain_id: string;
  task_type: string;
  status: "processing" | "completed" | "failed";
  result_payload: string | null;
  claimed_at: string;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Key Generation
// ─────────────────────────────────────────────────────────────

/**
 * Generates a deterministic SHA-256 idempotency key from the
 * given components. The key is a hex string prefixed with "idem_".
 *
 * @param domainId     - The domain/project scope
 * @param taskType     - Category of task (e.g., "decay_reversal", "outreach_email")
 * @param discriminator - Unique identifier within the task type (e.g., article URL, email)
 * @param timeWindow   - Rolling time window (e.g., "2026-W12", "2026-03", "2026-03-18")
 */
export async function generateIdempotencyKey(
  domainId: string,
  taskType: string,
  discriminator: string,
  timeWindow: string
): Promise<string> {
  const raw = `${domainId}::${taskType}::${discriminator}::${timeWindow}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = [...hashArray].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `idem_${hex}`;
}

/**
 * Convenience: returns the current ISO week string (e.g., "2026-W12")
 * for use as a weekly time window.
 */
export function currentWeekWindow(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil(
    (now.getTime() - jan1.getTime()) / 86_400_000
  );
  const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Convenience: returns the current month string (e.g., "2026-03")
 * for use as a monthly time window.
 */
export function currentMonthWindow(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Convenience: returns today's date string (e.g., "2026-03-18")
 * for use as a daily time window.
 */
export function currentDayWindow(): string {
  return new Date().toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────
// Claim / Complete / Fail
// ─────────────────────────────────────────────────────────────

/**
 * Attempts to claim an idempotency key. This is the gatekeeper
 * that every worker must pass through before executing.
 *
 * Logic:
 *   1. Check if the key already exists in D1.
 *   2. If status === 'completed' → return { claimed: false, reason: "already_completed" }
 *   3. If status === 'processing' → return { claimed: false, reason: "already_processing" }
 *      (the dead-letter sweeper will clean this up if the original worker died)
 *   4. If status === 'failed' → delete the old row and re-claim (retry is allowed)
 *   5. If key doesn't exist → INSERT and return { claimed: true }
 *
 * @param db          - D1 database binding
 * @param key         - The idempotency key (from generateIdempotencyKey)
 * @param domainId    - Domain/project scope
 * @param taskType    - Task category
 * @param ttlMinutes  - How long before the key expires (default: 1440 = 24 hours)
 */
export async function claimIdempotencyKey(
  db: D1Database,
  key: string,
  domainId: string,
  taskType: string,
  ttlMinutes: number = 1440
): Promise<IdempotencyClaimResult> {
  // Step 1: Check if key already exists
  const existing = await db
    .prepare("SELECT status FROM Idempotency_Keys WHERE idempotency_key = ?1")
    .bind(key)
    .first<{ status: string }>();

  if (existing) {
    if (existing.status === "completed") {
      return { claimed: false, reason: "already_completed", key };
    }
    if (existing.status === "processing") {
      return { claimed: false, reason: "already_processing", key };
    }
    // status === 'failed' → allow retry by deleting and re-inserting
    await db
      .prepare("DELETE FROM Idempotency_Keys WHERE idempotency_key = ?1")
      .bind(key)
      .run();
  }

  // Step 2: Calculate expiry
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  // Step 3: Insert the key
  try {
    await db
      .prepare(
        `INSERT INTO Idempotency_Keys (idempotency_key, domain_id, task_type, status, expires_at)
         VALUES (?1, ?2, ?3, 'processing', ?4)`
      )
      .bind(key, domainId, taskType, expiresAt)
      .run();

    return { claimed: true, key };
  } catch (err) {
    // Race condition: another worker inserted the key between our
    // SELECT and INSERT. This is expected and safe — we lose the race.
    console.warn(
      `[Idempotency] Failed to claim key ${key.slice(0, 20)}...: ` +
        (err instanceof Error ? err.message : "Unknown")
    );
    return { claimed: false, reason: "insert_failed", key };
  }
}

/**
 * Marks an idempotency key as 'completed'. Call this after the
 * worker's action has been fully executed and committed.
 *
 * @param db             - D1 database binding
 * @param key            - The idempotency key
 * @param resultPayload  - Optional JSON string with result data for auditing
 */
export async function markKeyCompleted(
  db: D1Database,
  key: string,
  resultPayload?: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE Idempotency_Keys
       SET status = 'completed',
           completed_at = datetime('now'),
           result_payload = ?2
       WHERE idempotency_key = ?1`
    )
    .bind(key, resultPayload ?? null)
    .run();
}

/**
 * Marks an idempotency key as 'failed'. The dead-letter sweeper
 * or a future retry will be able to re-claim this key.
 *
 * @param db             - D1 database binding
 * @param key            - The idempotency key
 * @param errorMessage   - Optional error details for debugging
 */
export async function markKeyFailed(
  db: D1Database,
  key: string,
  errorMessage?: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE Idempotency_Keys
       SET status = 'failed',
           completed_at = datetime('now'),
           result_payload = ?2
       WHERE idempotency_key = ?1`
    )
    .bind(key, errorMessage ? JSON.stringify({ error: errorMessage }) : null)
    .run();
}

/**
 * Purges expired idempotency keys to prevent the table from
 * growing unbounded. Called by the dead-letter sweeper.
 *
 * @param db - D1 database binding
 * @returns Number of rows deleted
 */
export async function purgeExpiredKeys(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `DELETE FROM Idempotency_Keys
       WHERE expires_at < datetime('now')
         AND status IN ('completed', 'failed')`
    )
    .run();
  return result.meta?.changes ?? 0;
}
