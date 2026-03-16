/**
 * ============================================================
 * Swarme — Phase 16: CRO Evaluation Engine
 * ============================================================
 *
 * Analyzes Page_Telemetry data against performance thresholds
 * to determine which pages need autonomous optimization.
 *
 * Decision Logic:
 *   1. If avg_scroll_depth < 30% AND cta_clicks == 0 after 100 views:
 *      → CTA is buried below the fold. Trigger "DOM_REORDER" task.
 *
 *   2. If avg_dwell_time_seconds < 10 after 100 views:
 *      → Intro is weak / page doesn't engage. Trigger "CONTENT_REWRITE".
 *
 *   3. Both conditions can fire simultaneously for severely
 *      underperforming content.
 *
 * The CRO engine does NOT mutate data — it evaluates and returns
 * a list of optimization tasks for the Durable Object to execute.
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type CROTaskType = "DOM_REORDER" | "CONTENT_REWRITE";

export interface CROTask {
  asset_id: string;
  task_type: CROTaskType;
  reason: string;
  priority: "high" | "medium" | "low";
  telemetry: {
    total_views: number;
    avg_scroll_depth: number;
    avg_dwell_time_seconds: number;
    cta_clicks: number;
  };
}

export interface CROEvaluationResult {
  asset_id: string;
  needs_optimization: boolean;
  tasks: CROTask[];
  summary: string;
}

export interface TelemetryRow {
  asset_id: string;
  total_views: number;
  avg_scroll_depth: number;
  avg_dwell_time_seconds: number;
  cta_clicks: number;
  last_optimized_at: string | null;
  title?: string;
  slug?: string;
  published_url?: string;
}

// ─────────────────────────────────────────────────────────────
// Thresholds (tunable)
// ─────────────────────────────────────────────────────────────

const CRO_THRESHOLDS = {
  /** Minimum views before the engine acts (avoid premature optimization) */
  MIN_VIEWS: 100,

  /** Scroll depth below this (%) with zero CTA clicks → CTA buried */
  SCROLL_DEPTH_FLOOR: 30,

  /** Dwell time below this (seconds) → weak intro / disengaged readers */
  DWELL_TIME_FLOOR: 10,

  /** Cooldown: don't re-optimize within this many hours */
  OPTIMIZATION_COOLDOWN_HOURS: 72,
} as const;

// ─────────────────────────────────────────────────────────────
// Core Evaluation Function
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates a single page's telemetry data and returns
 * optimization tasks if thresholds are breached.
 */
export function evaluatePagePerformance(
  assetId: string,
  telemetry: TelemetryRow
): CROEvaluationResult {
  const tasks: CROTask[] = [];

  const {
    total_views,
    avg_scroll_depth,
    avg_dwell_time_seconds,
    cta_clicks,
    last_optimized_at,
  } = telemetry;

  // Not enough data yet — skip
  if (total_views < CRO_THRESHOLDS.MIN_VIEWS) {
    return {
      asset_id: assetId,
      needs_optimization: false,
      tasks: [],
      summary: `Insufficient data (${total_views}/${CRO_THRESHOLDS.MIN_VIEWS} views). Waiting for more traffic.`,
    };
  }

  // Cooldown check: don't re-optimize too soon
  if (last_optimized_at) {
    const lastOpt = new Date(last_optimized_at).getTime();
    const cooldownMs = CRO_THRESHOLDS.OPTIMIZATION_COOLDOWN_HOURS * 3600 * 1000;
    if (Date.now() - lastOpt < cooldownMs) {
      return {
        asset_id: assetId,
        needs_optimization: false,
        tasks: [],
        summary: `Optimization cooldown active (last optimized ${last_optimized_at}). Check again after ${CRO_THRESHOLDS.OPTIMIZATION_COOLDOWN_HOURS}h.`,
      };
    }
  }

  const telemetrySnapshot = {
    total_views,
    avg_scroll_depth,
    avg_dwell_time_seconds,
    cta_clicks,
  };

  // ── Rule 1: CTA Buried ──
  // Low scroll depth + zero CTA engagement = users never see the CTA
  if (
    avg_scroll_depth < CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR &&
    cta_clicks === 0
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "DOM_REORDER",
      reason:
        `CTA buried: avg scroll depth ${avg_scroll_depth.toFixed(1)}% ` +
        `(threshold: ${CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR}%) with 0 CTA clicks ` +
        `after ${total_views} views. Moving CTA above the fold.`,
      priority: cta_clicks === 0 && avg_scroll_depth < 15 ? "high" : "medium",
      telemetry: telemetrySnapshot,
    });
  }

  // ── Rule 2: Weak Intro ──
  // Very low dwell time = users leave almost immediately
  if (avg_dwell_time_seconds < CRO_THRESHOLDS.DWELL_TIME_FLOOR) {
    tasks.push({
      asset_id: assetId,
      task_type: "CONTENT_REWRITE",
      reason:
        `Weak intro: avg dwell time ${avg_dwell_time_seconds}s ` +
        `(threshold: ${CRO_THRESHOLDS.DWELL_TIME_FLOOR}s) after ${total_views} views. ` +
        `Rewriting introduction to improve engagement.`,
      priority: avg_dwell_time_seconds < 5 ? "high" : "medium",
      telemetry: telemetrySnapshot,
    });
  }

  const needs_optimization = tasks.length > 0;

  return {
    asset_id: assetId,
    needs_optimization,
    tasks,
    summary: needs_optimization
      ? `${tasks.length} optimization(s) needed: ${tasks.map((t) => t.task_type).join(", ")}`
      : `Page performing within thresholds (scroll: ${avg_scroll_depth.toFixed(1)}%, dwell: ${avg_dwell_time_seconds}s, clicks: ${cta_clicks}).`,
  };
}

// ─────────────────────────────────────────────────────────────
// Batch Evaluation (for cron-triggered sweeps)
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates all tracked pages in a project and returns
 * a prioritized list of optimization tasks for the swarm.
 */
export function evaluateProjectTelemetry(
  pages: TelemetryRow[]
): {
  total_evaluated: number;
  pages_needing_optimization: number;
  tasks: CROTask[];
  results: CROEvaluationResult[];
} {
  const results = pages.map((page) =>
    evaluatePagePerformance(page.asset_id, page)
  );

  const allTasks = results.flatMap((r) => r.tasks);

  // Sort tasks: high priority first, then by view count (descending)
  allTasks.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.telemetry.total_views - a.telemetry.total_views;
  });

  return {
    total_evaluated: pages.length,
    pages_needing_optimization: results.filter((r) => r.needs_optimization)
      .length,
    tasks: allTasks,
    results,
  };
}
