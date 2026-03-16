/**
 * ============================================================
 * Phase 42 — Task 42.2: Autonomous CRO Trigger
 * ============================================================
 *
 * Extends the Proactive Retention Engine (Phase 27) with a new
 * analysis layer:
 *
 *   If GA4 reports that a specific URL has a >70% bounce rate
 *   strictly on Mobile devices, the Swarm autonomously:
 *     1. Generates a UI/UX improvement suggestion for the
 *        mobile viewport
 *     2. Adds it to the AI_Roadmap as a "Suggested" item
 *     3. Logs a task in Agent_Tasks to alert the user
 *
 * The trigger NEVER executes changes autonomously — it only
 * proposes improvements for human approval, consistent with
 * the Phase 17/18 operator-in-the-loop constraints.
 *
 * Called from the daily cron (06:00 UTC, after GA4 sync).
 * ============================================================
 */

import type { Env } from "../index";

// ── Constants ────────────────────────────────────────────────

const MOBILE_BOUNCE_THRESHOLD = 0.70; // 70%
const MIN_SESSIONS_THRESHOLD = 10;     // Ignore pages with < 10 mobile sessions
const MAX_SUGGESTIONS_PER_RUN = 5;     // Cap to avoid flooding the roadmap

// ── Types ────────────────────────────────────────────────────

interface HighBounceUrl {
  page_path: string;
  bounce_rate: number;
  sessions: number;
  avg_session_duration: number;
}

export interface CroTriggerResult {
  projectsScanned: number;
  highBounceUrls: number;
  roadmapItemsCreated: number;
  alertsLogged: number;
  errors: number;
}

// ── Suggestion Generator ─────────────────────────────────────

/**
 * Generate a specific mobile UX improvement suggestion based on
 * the page's bounce rate and session duration. These are heuristic
 * recommendations that would normally come from an LLM, but we
 * deterministically produce actionable suggestions to keep
 * cron execution fast and within CPU limits.
 */
function generateMobileSuggestion(url: HighBounceUrl): {
  title: string;
  description: string;
  priority: "High" | "Medium";
} {
  const bouncePercent = Math.round(url.bounce_rate * 100);
  const avgDuration = Math.round(url.avg_session_duration);

  // Very high bounce + very short session = layout / load issue
  if (url.bounce_rate > 0.85 && avgDuration < 10) {
    return {
      title: `Critical: Mobile viewport broken on ${url.page_path}`,
      description:
        `GA4 reports ${bouncePercent}% mobile bounce rate with only ${avgDuration}s avg session. ` +
        `This strongly indicates a mobile rendering issue (layout overflow, unresponsive viewport, ` +
        `or above-the-fold content not visible). Recommended: audit the mobile viewport meta tag, ` +
        `check for horizontal scroll overflow, ensure CTA is visible without scrolling, and test ` +
        `on actual iOS Safari / Chrome Android devices. ${url.sessions} mobile sessions sampled.`,
      priority: "High",
    };
  }

  // High bounce + moderate session = content/UX issue
  if (url.bounce_rate > 0.80) {
    return {
      title: `High mobile bounce on ${url.page_path} — UX audit needed`,
      description:
        `GA4 reports ${bouncePercent}% mobile bounce rate (${avgDuration}s avg session, ` +
        `${url.sessions} sessions). Users land but don't engage. Recommended: move the primary ` +
        `CTA above the fold on mobile, reduce hero image weight (target < 200KB), add a sticky ` +
        `mobile CTA bar, and simplify the navigation. Consider lazy-loading non-essential content ` +
        `below the fold to improve perceived load time.`,
      priority: "High",
    };
  }

  // Standard high bounce (>70%) = optimisation opportunity
  return {
    title: `Mobile bounce rate ${bouncePercent}% on ${url.page_path}`,
    description:
      `GA4 reports ${bouncePercent}% mobile bounce rate (${avgDuration}s avg session, ` +
      `${url.sessions} sessions). Above the 70% threshold. Recommended: review the mobile ` +
      `reading experience — font size should be ≥ 16px, tap targets ≥ 44px, and key content ` +
      `should be visible within the first scroll. Consider adding structured data (FAQ, How-to) ` +
      `to improve search snippet engagement and reduce pogo-sticking.`,
    priority: "Medium",
  };
}

// ── Main Trigger Logic ──────────────────────────────────────

export async function handleGa4CroTrigger(env: Env): Promise<CroTriggerResult> {
  const result: CroTriggerResult = {
    projectsScanned: 0,
    highBounceUrls: 0,
    roadmapItemsCreated: 0,
    alertsLogged: 0,
    errors: 0,
  };

  try {
    // ── Step 1: Find active projects with GA4 data ──
    const projects = await env.DB.prepare(
      "SELECT DISTINCT project_id FROM GA4_Metrics",
    ).all<{ project_id: string }>();

    const projectIds = (projects.results || []).map((p) => p.project_id);

    if (projectIds.length === 0) {
      console.log("[CRO Trigger] No GA4 data found, skipping");
      return result;
    }

    // ── Step 2: For each project, find high-bounce mobile pages ──
    for (const projectId of projectIds) {
      result.projectsScanned++;
      let createdThisProject = 0;

      try {
        // Query: average mobile bounce rate per page over the last 7 days
        const highBounceRows = await env.DB.prepare(
          `SELECT
             page_path,
             AVG(bounce_rate) AS bounce_rate,
             SUM(sessions)    AS sessions,
             AVG(avg_session_duration) AS avg_session_duration
           FROM GA4_Metrics
           WHERE project_id = ?
             AND device_category = 'mobile'
             AND date >= date('now', '-7 days')
           GROUP BY page_path
           HAVING AVG(bounce_rate) > ?
              AND SUM(sessions) >= ?
           ORDER BY AVG(bounce_rate) DESC
           LIMIT ?`,
        )
          .bind(projectId, MOBILE_BOUNCE_THRESHOLD, MIN_SESSIONS_THRESHOLD, MAX_SUGGESTIONS_PER_RUN)
          .all<HighBounceUrl>();

        const urls = highBounceRows.results || [];
        result.highBounceUrls += urls.length;

        if (urls.length === 0) {
          console.log(`[CRO Trigger] Project ${projectId}: no high-bounce mobile pages`);
          continue;
        }

        console.log(`[CRO Trigger] Project ${projectId}: ${urls.length} high-bounce mobile page(s)`);

        // ── Step 3: For each URL, check if we already suggested it recently ──
        for (const url of urls) {
          // De-duplicate: skip if we already created a roadmap item for this page in the last 7 days
          const existing = await env.DB.prepare(
            `SELECT id FROM AI_Roadmap
             WHERE project_id = ?
               AND title LIKE ?
               AND created_at > datetime('now', '-7 days')
             LIMIT 1`,
          )
            .bind(projectId, `%${url.page_path}%`)
            .first<{ id: string }>();

          if (existing) {
            console.log(`[CRO Trigger] Skipping ${url.page_path} — roadmap item already exists`);
            continue;
          }

          // ── Step 4: Generate suggestion and insert into AI_Roadmap ──
          const suggestion = generateMobileSuggestion(url);
          const roadmapId = `roadmap_cro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          await env.DB.prepare(
            `INSERT INTO AI_Roadmap (id, project_id, title, description, priority, status, action_payload)
             VALUES (?1, ?2, ?3, ?4, ?5, 'Suggested', ?6)`,
          )
            .bind(
              roadmapId,
              projectId,
              suggestion.title,
              suggestion.description,
              suggestion.priority,
              JSON.stringify({
                source: "ga4_cro_trigger",
                page_path: url.page_path,
                device: "mobile",
                bounce_rate: url.bounce_rate,
                sessions: url.sessions,
                avg_session_duration: url.avg_session_duration,
                trigger_date: new Date().toISOString(),
              }),
            )
            .run();

          result.roadmapItemsCreated++;
          createdThisProject++;

          // ── Step 5: Log an Agent_Task to alert the user ──
          await env.DB.prepare(
            `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
             VALUES (?1, 'cro', 'Mobile UX Alert', 'Completed', ?2)`,
          )
            .bind(
              projectId,
              `[GA4 CRO] ${url.page_path} has ${Math.round(url.bounce_rate * 100)}% mobile bounce rate ` +
              `(${url.sessions} sessions). UI/UX improvement suggestion added to Roadmap as "${suggestion.title}".`,
            )
            .run();

          result.alertsLogged++;
        }

        console.log(
          `[CRO Trigger] Project ${projectId}: created ${createdThisProject} roadmap suggestion(s)`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[CRO Trigger] Error for project ${projectId}: ${msg}`);
        result.errors++;
      }
    }
  } catch (err) {
    console.error("[CRO Trigger] Fatal error:", err instanceof Error ? err.message : err);
    result.errors++;
  }

  console.log(
    `[CRO Trigger] Complete — ${result.projectsScanned} projects, ` +
    `${result.highBounceUrls} high-bounce URLs, ${result.roadmapItemsCreated} roadmap items, ` +
    `${result.alertsLogged} alerts, ${result.errors} errors`,
  );

  return result;
}
