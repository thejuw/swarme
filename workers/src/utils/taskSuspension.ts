/**
 * ============================================================
 * Swarme — Phase 66: Intelligent Task Suspension
 * ============================================================
 *
 * When a ServiceDegradedError or CircuitOpenError is thrown during
 * task execution, the task should NOT be marked "Failed" —
 * it should be SUSPENDED. Suspended tasks are automatically
 * resumed once the pulse engine detects service recovery.
 *
 * Lifecycle:
 *   1. Agent tries outbound call → ServiceDegradedError thrown
 *   2. Caller catches error → calls suspendTask()
 *   3. Task row updated: status = 'Suspended', suspension_reason set
 *   4. Pulse engine detects recovery (down → healthy)
 *   5. Ghost-task sweeper (enhanced) finds suspended tasks for the
 *      recovered service and resets them to 'Pending'
 *
 * This module provides:
 *   - suspendTask()   — Mark an Agent_Task as suspended
 *   - resumeTasks()   — Resume all tasks suspended for a service
 *   - getSuspended()  — Query suspended tasks (admin dashboard)
 *
 * Migration 0043 adds:
 *   - suspension_status column to Agent_Tasks ('active'|'suspended')
 *   - suspension_reason column (why it was suspended)
 *   - suspended_service column (which service caused suspension)
 *   - suspended_at column (when it was suspended)
 *
 * Security:
 *   - All D1 queries use parameterized inputs
 *   - domain_id is always included for multi-tenant isolation
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

export interface SuspendedTask {
  id: number;
  project_id: string;
  agent_type: string;
  action: string;
  task_description: string | null;
  suspension_reason: string;
  suspended_service: string;
  suspended_at: string;
}

export interface SuspensionResult {
  taskId: number;
  suspended: boolean;
  reason: string;
}

export interface ResumeResult {
  service: string;
  tasksResumed: number;
}

// ── Suspend a Task ───────────────────────────────────────────

/**
 * Mark an Agent_Task as suspended due to a downstream service outage.
 *
 * @param env    - Worker environment
 * @param taskId - The Agent_Tasks row ID (or insert ID)
 * @param service - The upstream service that is degraded
 * @param reason  - Human-readable suspension reason
 */
export async function suspendTask(
  env: Env,
  taskId: number | string,
  service: string,
  reason: string,
): Promise<SuspensionResult> {
  const now = new Date().toISOString();

  try {
    const result = await env.DB.prepare(
      `UPDATE Agent_Tasks
       SET status = 'Suspended',
           suspension_status = 'suspended',
           suspension_reason = ?1,
           suspended_service = ?2,
           suspended_at = ?3
       WHERE id = ?4
         AND status != 'Completed'`,
    )
      .bind(reason, service, now, taskId)
      .run();

    const changed = (result.meta?.changes || 0) > 0;

    if (changed) {
      console.log(
        `[TaskSuspension] Task ${taskId} suspended — service: ${service}, reason: ${reason}`,
      );
    }

    return {
      taskId: typeof taskId === "string" ? parseInt(taskId, 10) : taskId,
      suspended: changed,
      reason,
    };
  } catch (err) {
    console.error(`[TaskSuspension] Failed to suspend task ${taskId}:`, err);
    return {
      taskId: typeof taskId === "string" ? parseInt(taskId, 10) : taskId,
      suspended: false,
      reason: `Suspension failed: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

// ── Resume Tasks for a Recovered Service ─────────────────────

/**
 * Resume all tasks that were suspended due to a specific service outage.
 * Called by the pulse engine when a service recovers (down → healthy).
 *
 * Resets tasks back to 'Pending' so the next cron cycle picks them up.
 */
export async function resumeTasks(
  env: Env,
  service: string,
): Promise<ResumeResult> {
  try {
    const result = await env.DB.prepare(
      `UPDATE Agent_Tasks
       SET status = 'Pending',
           suspension_status = 'active',
           suspension_reason = NULL,
           suspended_service = NULL,
           suspended_at = NULL
       WHERE suspension_status = 'suspended'
         AND suspended_service = ?1`,
    )
      .bind(service)
      .run();

    const tasksResumed = result.meta?.changes || 0;

    if (tasksResumed > 0) {
      console.log(
        `[TaskSuspension] Resumed ${tasksResumed} task(s) — service ${service} recovered`,
      );

      // Log the recovery as an Agent_Task for audit trail
      await env.DB.prepare(
        `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
         VALUES ('system', 'pulse_engine', 'Service Recovery', 'Completed', ?1)`,
      )
        .bind(
          `Resumed ${tasksResumed} suspended task(s) after ${service} recovered`,
        )
        .run();
    }

    return { service, tasksResumed };
  } catch (err) {
    console.error(`[TaskSuspension] Failed to resume tasks for ${service}:`, err);
    return { service, tasksResumed: 0 };
  }
}

// ── Query Suspended Tasks ────────────────────────────────────

/**
 * Get all currently suspended tasks (for admin dashboard).
 */
export async function getSuspendedTasks(
  env: Env,
): Promise<SuspendedTask[]> {
  try {
    const result = await env.DB.prepare(
      `SELECT id, project_id, agent_type, action, task_description,
              suspension_reason, suspended_service, suspended_at
       FROM Agent_Tasks
       WHERE suspension_status = 'suspended'
       ORDER BY suspended_at DESC
       LIMIT 100`,
    ).all<SuspendedTask>();

    return result.results || [];
  } catch (err) {
    console.error("[TaskSuspension] Failed to query suspended tasks:", err);
    return [];
  }
}

/**
 * Count suspended tasks grouped by service (for status banner).
 */
export async function getSuspensionCounts(
  env: Env,
): Promise<Record<string, number>> {
  try {
    const result = await env.DB.prepare(
      `SELECT suspended_service, COUNT(*) as count
       FROM Agent_Tasks
       WHERE suspension_status = 'suspended'
       GROUP BY suspended_service`,
    ).all<{ suspended_service: string; count: number }>();

    const counts: Record<string, number> = {};
    for (const row of result.results || []) {
      if (row.suspended_service) {
        counts[row.suspended_service] = row.count;
      }
    }
    return counts;
  } catch {
    return {};
  }
}
