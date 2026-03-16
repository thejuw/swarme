/**
 * ============================================================
 * Phase 57.2: Infinite Loop Kill-Switch
 * ============================================================
 *
 * Prevents runaway agent execution loops by tracking attempt
 * counts per (domain_id, task_type) in the Agent_Failsafe table.
 *
 * Before any agent executes a state-changing or paid action
 * (e.g., deductFunds, CMS push, outreach send), it must call
 * `checkExecutionCap()`. If attempt_count >= MAX_ATTEMPTS within
 * a 24-hour window, execution is hard-blocked.
 *
 * The kill-switch:
 *   1. Throws MaxRetriesExceeded (caught by calling code)
 *   2. Logs the block to Action_History for audit
 *   3. Pushes a notification message to the AI Manager UI
 *
 * Manual unblock via:
 *   POST /api/admin/failsafe/unblock { domain_id, task_type }
 *
 * Security:
 *   - All D1 queries use parameterized inputs
 *   - 24-hour rolling window prevents permanent soft-locks
 *   - Manual override requires superadmin JWT
 * ============================================================
 */

import type { Env } from "../index";

// ── Constants ────────────────────────────────────────────────

/** Maximum attempts per task_type within a 24-hour window */
const MAX_ATTEMPTS = 3;

/** Rolling window in hours */
const WINDOW_HOURS = 24;

// ── Types ────────────────────────────────────────────────────

interface FailsafeRow {
  id: string;
  domain_id: string;
  task_type: string;
  attempt_count: number;
  last_attempt_at: string;
  blocked: number;
  blocked_reason: string | null;
}

export interface FailsafeStatus {
  domain_id: string;
  task_type: string;
  attempt_count: number;
  blocked: boolean;
  blocked_reason: string | null;
  last_attempt_at: string | null;
  window_resets_at: string | null;
}

// ── MaxRetriesExceeded Error ─────────────────────────────────

export class MaxRetriesExceeded extends Error {
  public readonly domainId: string;
  public readonly taskType: string;
  public readonly attemptCount: number;
  /** Pre-formatted message for the AI Manager UI notification */
  public readonly uiMessage: string;

  constructor(domainId: string, taskType: string, attemptCount: number) {
    const msg =
      `[ExecutionCap] Task "${taskType}" on domain ${domainId} has failed ` +
      `${attemptCount} times in ${WINDOW_HOURS}h. Execution suspended.`;

    super(msg);
    this.name = "MaxRetriesExceeded";
    this.domainId = domainId;
    this.taskType = taskType;
    this.attemptCount = attemptCount;
    this.uiMessage =
      `I encountered a persistent error with ${humanizeTaskType(taskType)}. ` +
      `To protect your budget, I have suspended this specific task until you ` +
      `can manually review the logs. (${attemptCount} failed attempts in ${WINDOW_HOURS}h)`;
  }
}

// ── Core: Check Execution Cap ────────────────────────────────

/**
 * Check if a paid/state-changing action is allowed to execute.
 * Call this BEFORE deductFunds, CMS push, or outreach send.
 *
 * @param env - Worker environment bindings
 * @param domainId - The domain attempting the action
 * @param taskType - A descriptive key like "ugc_campaign", "cms_publish", "outreach_send"
 * @returns true if execution is allowed
 * @throws MaxRetriesExceeded if the kill-switch has engaged
 */
export async function checkExecutionCap(
  env: Env,
  domainId: string,
  taskType: string,
): Promise<true> {
  const now = new Date();
  const windowStart = new Date(
    now.getTime() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  // Query existing failsafe row
  const row = await env.DB.prepare(
    `SELECT id, domain_id, task_type, attempt_count, last_attempt_at, blocked, blocked_reason
     FROM Agent_Failsafe
     WHERE domain_id = ? AND task_type = ?`,
  )
    .bind(domainId, taskType)
    .first<FailsafeRow>();

  // No row → first attempt, always allowed
  if (!row) {
    return true;
  }

  // Manually blocked by admin → stay blocked
  if (row.blocked === 1) {
    throw new MaxRetriesExceeded(domainId, taskType, row.attempt_count);
  }

  // Check if last_attempt is within the rolling window
  const lastAttempt = new Date(row.last_attempt_at);
  const windowStartDate = new Date(windowStart);

  if (lastAttempt < windowStartDate) {
    // Outside the 24h window → reset counter, allow
    await env.DB.prepare(
      `UPDATE Agent_Failsafe
       SET attempt_count = 0, blocked = 0, blocked_reason = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(row.id)
      .run();
    return true;
  }

  // Within window — check count
  if (row.attempt_count >= MAX_ATTEMPTS) {
    // Auto-block and throw
    await env.DB.prepare(
      `UPDATE Agent_Failsafe
       SET blocked = 1,
           blocked_reason = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(
        `Auto-blocked: ${row.attempt_count} failures in ${WINDOW_HOURS}h window`,
        row.id,
      )
      .run();

    // Log to Action_History
    await logFailsafeBlock(env, domainId, taskType, row.attempt_count);

    throw new MaxRetriesExceeded(domainId, taskType, row.attempt_count);
  }

  // Under the limit → allowed
  return true;
}

// ── Core: Record an Attempt ──────────────────────────────────

/**
 * Record a failed attempt for a task. Call this when a paid
 * action fails (API error, CMS rejection, etc.).
 */
export async function recordFailedAttempt(
  env: Env,
  domainId: string,
  taskType: string,
  errorMsg?: string,
): Promise<{ attemptCount: number; blocked: boolean }> {
  const now = new Date().toISOString();

  // Upsert: increment or insert
  const existing = await env.DB.prepare(
    `SELECT id, attempt_count FROM Agent_Failsafe
     WHERE domain_id = ? AND task_type = ?`,
  )
    .bind(domainId, taskType)
    .first<{ id: string; attempt_count: number }>();

  let newCount: number;

  if (existing) {
    newCount = existing.attempt_count + 1;
    await env.DB.prepare(
      `UPDATE Agent_Failsafe
       SET attempt_count = ?, last_attempt_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(newCount, now, existing.id)
      .run();
  } else {
    newCount = 1;
    await env.DB.prepare(
      `INSERT INTO Agent_Failsafe (id, domain_id, task_type, attempt_count, last_attempt_at)
       VALUES (?, ?, ?, 1, ?)`,
    )
      .bind(crypto.randomUUID(), domainId, taskType, now)
      .run();
  }

  const blocked = newCount >= MAX_ATTEMPTS;

  if (blocked) {
    console.warn(
      `[ExecutionCap] KILL-SWITCH: ${taskType} on domain ${domainId} ` +
      `has reached ${newCount} failures. Blocking further execution.`,
    );
  }

  return { attemptCount: newCount, blocked };
}

// ── Admin: Unblock a task ────────────────────────────────────

/**
 * Manually unblock a task (admin operation).
 * Resets the attempt counter and clears the block flag.
 */
export async function unblockTask(
  env: Env,
  domainId: string,
  taskType: string,
): Promise<{ success: boolean }> {
  const result = await env.DB.prepare(
    `UPDATE Agent_Failsafe
     SET attempt_count = 0, blocked = 0, blocked_reason = NULL, updated_at = datetime('now')
     WHERE domain_id = ? AND task_type = ?`,
  )
    .bind(domainId, taskType)
    .run();

  const changed = (result.meta?.changes || 0) > 0;

  if (changed) {
    console.log(
      `[ExecutionCap] Admin unblocked: ${taskType} on domain ${domainId}`,
    );
  }

  return { success: changed };
}

// ── Query: Get all failsafe statuses for a domain ────────────

export async function getFailsafeStatuses(
  env: Env,
  domainId: string,
): Promise<FailsafeStatus[]> {
  const rows = await env.DB.prepare(
    `SELECT domain_id, task_type, attempt_count, blocked, blocked_reason, last_attempt_at
     FROM Agent_Failsafe
     WHERE domain_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(domainId)
    .all<FailsafeRow>();

  return (rows.results || []).map((row) => {
    const lastAttempt = row.last_attempt_at
      ? new Date(row.last_attempt_at)
      : null;
    const windowEnd = lastAttempt
      ? new Date(lastAttempt.getTime() + WINDOW_HOURS * 60 * 60 * 1000)
      : null;

    return {
      domain_id: row.domain_id,
      task_type: row.task_type,
      attempt_count: row.attempt_count,
      blocked: row.blocked === 1,
      blocked_reason: row.blocked_reason,
      last_attempt_at: row.last_attempt_at,
      window_resets_at: windowEnd?.toISOString() || null,
    };
  });
}

// ── Internal: Log block to Action_History ─────────────────────

async function logFailsafeBlock(
  env: Env,
  domainId: string,
  taskType: string,
  attemptCount: number,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO Action_History
         (id, domain_id, project_id, agent_type, action, entity_type, entity_id, details, created_at, rolled_back)
       VALUES (?, ?, 'system', 'failsafe', 'EXECUTION_BLOCKED', 'task', ?, ?, datetime('now'), 0)`,
    )
      .bind(
        crypto.randomUUID(),
        domainId,
        taskType,
        JSON.stringify({
          task_type: taskType,
          attempt_count: attemptCount,
          window_hours: WINDOW_HOURS,
          max_attempts: MAX_ATTEMPTS,
          reason: `Auto-blocked after ${attemptCount} failures in ${WINDOW_HOURS}h`,
        }),
      )
      .run();
  } catch (err) {
    console.error("[ExecutionCap] Failed to log to Action_History:", err);
  }
}

// ── Helper: Humanize task type for UI messages ───────────────

function humanizeTaskType(taskType: string): string {
  const map: Record<string, string> = {
    ugc_campaign: "the external UGC network",
    cms_publish: "the CMS publishing pipeline",
    outreach_send: "the outreach email campaign",
    media_generation: "the media generation service",
    credit_deduction: "the billing/credit system",
    social_post: "the social media posting service",
    content_refresh: "the content refresh pipeline",
  };
  return map[taskType] || `the "${taskType}" workflow`;
}
