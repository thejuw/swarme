/**
 * ============================================================
 * Swarme — Phase 62: Ghost-Task Sweeper (Dead Letter Queue)
 * ============================================================
 *
 * Problem:
 *   A worker claims an idempotency key (status = 'processing')
 *   but then crashes, times out, or is evicted before it can
 *   mark the key as 'completed' or 'failed'. That task is now
 *   permanently locked — no other worker can claim it, and no
 *   retry will ever happen.
 *
 * Solution:
 *   This cron runs every 15 minutes. It scans the Idempotency_Keys
 *   table for any row stuck in 'processing' for more than 10
 *   minutes. It resets those rows to 'failed', which allows the
 *   next execution cycle to re-claim and retry them.
 *
 * Additionally, it purges expired completed/failed keys to
 * prevent unbounded table growth.
 *
 * Schedule: */15 * * * * (every 15 minutes)
 *
 * ============================================================
 */

import type { Env } from "../index";
import { purgeExpiredKeys } from "../utils/idempotency";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

/** Tasks stuck in 'processing' for longer than this are considered dead */
const STUCK_THRESHOLD_MINUTES = 10;

/** Maximum number of stuck tasks to reset per sweep (prevent runaway) */
const MAX_RESET_PER_SWEEP = 100;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface StuckTask {
  idempotency_key: string;
  domain_id: string;
  task_type: string;
  claimed_at: string;
}

export interface DeadLetterResult {
  stuckTasksFound: number;
  tasksReset: number;
  expiredKeysPurged: number;
  errors: string[];
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

/**
 * Main entry point — called by the cron dispatcher in index.ts.
 *
 * Steps:
 *   1. Find all 'processing' rows where claimed_at is older
 *      than STUCK_THRESHOLD_MINUTES.
 *   2. Reset each to 'failed' so the next worker cycle can
 *      re-claim and retry.
 *   3. Log each reset as an Agent_Task for the admin dashboard.
 *   4. Purge expired completed/failed keys to keep the table lean.
 */
export async function handleDeadLetterSweep(
  env: Env
): Promise<DeadLetterResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // ── Step 1: Find stuck tasks ───────────────────────────────
  const cutoffTime = new Date(
    Date.now() - STUCK_THRESHOLD_MINUTES * 60_000
  ).toISOString();

  let stuckTasks: StuckTask[] = [];

  try {
    const result = await env.DB.prepare(
      `SELECT idempotency_key, domain_id, task_type, claimed_at
       FROM Idempotency_Keys
       WHERE status = 'processing'
         AND claimed_at < ?1
       ORDER BY claimed_at ASC
       LIMIT ?2`
    )
      .bind(cutoffTime, MAX_RESET_PER_SWEEP)
      .all<StuckTask>();

    stuckTasks = result.results || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    errors.push(`Failed to query stuck tasks: ${msg}`);
    console.error(`[DeadLetter] Query failed: ${msg}`);
  }

  // ── Step 2: Reset stuck tasks to 'failed' ──────────────────
  let tasksReset = 0;

  if (stuckTasks.length > 0) {
    console.log(
      `[DeadLetter] Found ${stuckTasks.length} stuck task(s) older than ${STUCK_THRESHOLD_MINUTES}min`
    );

    for (const task of stuckTasks) {
      try {
        await env.DB.prepare(
          `UPDATE Idempotency_Keys
           SET status = 'failed',
               completed_at = datetime('now'),
               result_payload = ?2
           WHERE idempotency_key = ?1
             AND status = 'processing'`
        )
          .bind(
            task.idempotency_key,
            JSON.stringify({
              reset_by: "dead_letter_sweeper",
              reason: `Stuck in processing since ${task.claimed_at} (>${STUCK_THRESHOLD_MINUTES}min)`,
              reset_at: new Date().toISOString(),
            })
          )
          .run();

        tasksReset++;

        console.log(
          `[DeadLetter] Reset: ${task.task_type} for domain ${task.domain_id} ` +
            `(claimed at ${task.claimed_at})`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown";
        errors.push(
          `Failed to reset key ${task.idempotency_key.slice(0, 20)}...: ${msg}`
        );
      }
    }

    // Log a single Agent_Task for the admin dashboard
    try {
      await env.DB.prepare(
        `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
         VALUES ('system', 'dead_letter', 'Ghost-Task Sweep', 'Completed', ?1, ?2)`
      )
        .bind(
          `Reset ${tasksReset} stuck task(s) of ${stuckTasks.length} found`,
          JSON.stringify({
            tasks_reset: stuckTasks.map((t) => ({
              key: t.idempotency_key.slice(0, 24) + "...",
              domain_id: t.domain_id,
              task_type: t.task_type,
              stuck_since: t.claimed_at,
            })),
          })
        )
        .run();
    } catch (logErr) {
      // Non-critical — the reset already happened
      console.warn("[DeadLetter] Failed to log sweep to Agent_Tasks:", logErr);
    }
  }

  // ── Step 3: Purge expired keys ─────────────────────────────
  let expiredKeysPurged = 0;

  try {
    expiredKeysPurged = await purgeExpiredKeys(env.DB);
    if (expiredKeysPurged > 0) {
      console.log(`[DeadLetter] Purged ${expiredKeysPurged} expired key(s)`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    errors.push(`Failed to purge expired keys: ${msg}`);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[DeadLetter] Sweep complete in ${durationMs}ms — ` +
      `${stuckTasks.length} stuck, ${tasksReset} reset, ` +
      `${expiredKeysPurged} expired purged`
  );

  return {
    stuckTasksFound: stuckTasks.length,
    tasksReset,
    expiredKeysPurged,
    errors,
    durationMs,
  };
}
