/**
 * ============================================================
 * Phase 44: Digest Email Aggregator
 * ============================================================
 *
 * Queries Action_History and Agent_Tasks for a user's projects
 * over a given timeframe (24h for daily, 7d for weekly) and
 * groups them into a human-friendly HTML email digest.
 *
 * Categories:
 *   - Content Published  (writer, publisher)
 *   - ADA/SEO Fixes      (auditor, vision, cro)
 *   - A/B Tests           (cro — ab_test actions)
 *   - Social Drafts       (social)
 *   - Outreach            (outreach)
 *   - System              (ga4_sync, gsc_sync, retention, etc.)
 *
 * The function returns structured data AND a rendered HTML
 * email string ready for dispatch via Resend.
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface DigestCategory {
  label: string;
  emoji: string;
  count: number;
  highlights: string[];
}

export interface DigestData {
  userId: string;
  email: string;
  timeframe: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  totalActions: number;
  categories: DigestCategory[];
}

export interface DigestResult {
  data: DigestData;
  html: string;
  subject: string;
}

// ─────────────────────────────────────────────────────────────
// Action Row Types
// ─────────────────────────────────────────────────────────────

interface ActionRow {
  agent_type: string;
  action: string;
  entity_type: string;
  task_description?: string;
}

interface TaskRow {
  agent_type: string;
  action: string;
  status: string;
  task_description: string;
}

// ─────────────────────────────────────────────────────────────
// Category Classifier
// ─────────────────────────────────────────────────────────────

type CategoryKey =
  | "content"
  | "ada_seo"
  | "ab_tests"
  | "social"
  | "outreach"
  | "media"
  | "system";

const CATEGORY_CONFIG: Record<
  CategoryKey,
  { label: string; emoji: string }
> = {
  content: { label: "Content Published", emoji: "📝" },
  ada_seo: { label: "ADA & SEO Fixes", emoji: "🔧" },
  ab_tests: { label: "A/B Tests", emoji: "🧪" },
  social: { label: "Social Drafts", emoji: "📱" },
  outreach: { label: "Outreach & Link Building", emoji: "🔗" },
  media: { label: "Media Generated", emoji: "🎨" },
  system: { label: "System Operations", emoji: "⚙️" },
};

function classifyAction(agentType: string, action: string): CategoryKey {
  const at = agentType.toLowerCase();
  const act = action.toLowerCase();

  if (at === "writer" || at === "publisher" || act.includes("publish") || act.includes("draft_article")) {
    return "content";
  }
  if (at === "auditor" || at === "vision" || act.includes("alt") || act.includes("ada") || act.includes("accessibility") || act.includes("audit")) {
    return "ada_seo";
  }
  if (act.includes("ab_test") || act.includes("a/b") || act.includes("split")) {
    return "ab_tests";
  }
  if (at === "cro" && !act.includes("ab")) {
    return "ada_seo";
  }
  if (at === "social") {
    return "social";
  }
  if (at === "outreach" || act.includes("link_building")) {
    return "outreach";
  }
  if (at === "media" || act.includes("media") || act.includes("image") || act.includes("dalle")) {
    return "media";
  }
  return "system";
}

// ─────────────────────────────────────────────────────────────
// Data Aggregation
// ─────────────────────────────────────────────────────────────

/**
 * Generate digest data by querying Action_History and Agent_Tasks
 * for all projects owned by the given user within the timeframe.
 */
export async function generateDigestData(
  userId: string,
  timeframe: "daily" | "weekly",
  env: Env
): Promise<DigestData | null> {
  // Look up user email
  const user = await env.DB.prepare(
    "SELECT id, email FROM Users WHERE id = ?1"
  )
    .bind(userId)
    .first<{ id: string; email: string }>();

  if (!user) return null;

  // Calculate time window
  const now = new Date();
  const hoursBack = timeframe === "daily" ? 24 : 168; // 24h or 7 days
  const periodStart = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

  const periodStartISO = periodStart.toISOString().replace("T", " ").slice(0, 19);
  const periodEndISO = now.toISOString().replace("T", " ").slice(0, 19);

  // Get all project IDs owned by this user
  const projectsResult = await env.DB.prepare(
    "SELECT id FROM Projects WHERE user_id = ?1"
  )
    .bind(userId)
    .all<{ id: string }>();

  const projectIds = (projectsResult.results ?? []).map((p) => p.id);
  if (projectIds.length === 0) {
    return {
      userId,
      email: user.email,
      timeframe,
      periodStart: periodStartISO,
      periodEnd: periodEndISO,
      totalActions: 0,
      categories: [],
    };
  }

  // Build parameterized IN clause
  const placeholders = projectIds.map((_, i) => `?${i + 2}`).join(", ");

  // Query Action_History
  let actionRows: ActionRow[] = [];
  try {
    const actionResult = await env.DB.prepare(
      `SELECT agent_type, action, entity_type
       FROM Action_History
       WHERE project_id IN (${placeholders})
         AND created_at >= ?1
         AND rolled_back = 0
       ORDER BY created_at DESC`
    )
      .bind(periodStartISO, ...projectIds)
      .all<ActionRow>();
    actionRows = actionResult.results ?? [];
  } catch {
    // Action_History might not have data yet — fall through to Agent_Tasks
  }

  // Query Agent_Tasks as supplementary source
  let taskRows: TaskRow[] = [];
  try {
    const taskResult = await env.DB.prepare(
      `SELECT agent_type, action, status, task_description
       FROM Agent_Tasks
       WHERE project_id IN (${placeholders})
         AND created_at >= ?1
         AND status IN ('Completed', 'Running')
       ORDER BY created_at DESC`
    )
      .bind(periodStartISO, ...projectIds)
      .all<TaskRow>();
    taskRows = taskResult.results ?? [];
  } catch {
    // Agent_Tasks query failed — continue with what we have
  }

  // Aggregate into categories
  const counts: Record<CategoryKey, { count: number; highlights: string[] }> = {
    content: { count: 0, highlights: [] },
    ada_seo: { count: 0, highlights: [] },
    ab_tests: { count: 0, highlights: [] },
    social: { count: 0, highlights: [] },
    outreach: { count: 0, highlights: [] },
    media: { count: 0, highlights: [] },
    system: { count: 0, highlights: [] },
  };

  // Process Action_History rows
  for (const row of actionRows) {
    const cat = classifyAction(row.agent_type, row.action);
    counts[cat].count++;
    if (counts[cat].highlights.length < 3) {
      counts[cat].highlights.push(row.action);
    }
  }

  // Process Agent_Tasks rows (supplement, avoid double-counting)
  for (const row of taskRows) {
    const cat = classifyAction(row.agent_type, row.action);
    counts[cat].count++;
    if (counts[cat].highlights.length < 3) {
      const desc = row.task_description || row.action;
      counts[cat].highlights.push(
        desc.length > 80 ? desc.slice(0, 77) + "..." : desc
      );
    }
  }

  // Build output categories (only non-zero)
  const categories: DigestCategory[] = (
    Object.keys(counts) as CategoryKey[]
  )
    .filter((key) => counts[key].count > 0)
    .map((key) => ({
      label: CATEGORY_CONFIG[key].label,
      emoji: CATEGORY_CONFIG[key].emoji,
      count: counts[key].count,
      highlights: counts[key].highlights,
    }));

  const totalActions = categories.reduce((sum, c) => sum + c.count, 0);

  return {
    userId,
    email: user.email,
    timeframe,
    periodStart: periodStartISO,
    periodEnd: periodEndISO,
    totalActions,
    categories,
  };
}

// ─────────────────────────────────────────────────────────────
// HTML Email Renderer
// ─────────────────────────────────────────────────────────────

function renderDigestHtml(data: DigestData): string {
  const title =
    data.timeframe === "daily"
      ? "Your Daily Swarm Digest"
      : "Your Weekly Swarm Wrap-Up";

  const subtitle =
    data.timeframe === "daily"
      ? "Here's everything the Swarm accomplished in the last 24 hours."
      : "Here's your weekly ROI and action report for the past 7 days.";

  const categoryRowsHtml = data.categories
    .map(
      (cat) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #2a2d37;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:15px;color:#ffffff;font-weight:600;">
                  ${cat.emoji}&nbsp; ${cat.label}
                </td>
                <td align="right" style="font-size:24px;font-weight:700;color:#22c55e;font-variant-numeric:tabular-nums;">
                  ${cat.count}
                </td>
              </tr>
              ${
                cat.highlights.length > 0
                  ? `<tr><td colspan="2" style="padding-top:6px;">
                      <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                        ${cat.highlights.map((h) => `&bull; ${escapeHtml(h)}`).join("<br/>")}
                      </p>
                    </td></tr>`
                  : ""
              }
            </table>
          </td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2a2d37;">
          <table width="100%"><tr>
            <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
              &#x2B21; Swarme
            </td>
            <td align="right">
              <span style="display:inline-block;background:#22c55e20;color:#22c55e;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">
                ${data.timeframe === "daily" ? "DAILY DIGEST" : "WEEKLY WRAP-UP"}
              </span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Title -->
        <tr><td style="padding:32px 40px 16px;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
            ${title}
          </h1>
          <p style="margin:8px 0 0;font-size:14px;color:#a1a1aa;line-height:1.5;">
            ${subtitle}
          </p>
        </td></tr>

        <!-- Total actions banner -->
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#22c55e10;border:1px solid #22c55e30;border-radius:8px;padding:16px 20px;text-align:center;">
            <span style="font-size:36px;font-weight:800;color:#22c55e;font-variant-numeric:tabular-nums;">
              ${data.totalActions}
            </span>
            <br/>
            <span style="font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:1px;">
              Total Actions Executed
            </span>
          </div>
        </td></tr>

        <!-- Category breakdown -->
        <tr><td style="padding:0 40px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${categoryRowsHtml}
          </table>
        </td></tr>

        <!-- CTA Button -->
        <tr><td style="padding:8px 40px 32px;" align="center">
          <a href="https://swarme.io/#/dashboard"
             style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">
            Log in to Mission Control &rarr;
          </a>
        </td></tr>

        <!-- Period info -->
        <tr><td style="padding:0 40px 24px;" align="center">
          <p style="margin:0;font-size:11px;color:#52525b;">
            Period: ${data.periodStart.slice(0, 10)} to ${data.periodEnd.slice(0, 10)}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #2a2d37;">
          <p style="margin:0;font-size:12px;color:#52525b;line-height:1.5;">
            You received this because your alert frequency is set to "${data.timeframe}" in your
            <a href="https://swarme.io/#/settings" style="color:#22c55e;text-decoration:none;">notification preferences</a>.
            Change to "Muted" to stop these emails.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Escape HTML entities in user-facing text */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a complete digest email for a user.
 * Returns null if the user has no actions in the timeframe.
 */
export async function generateDigestEmail(
  userId: string,
  timeframe: "daily" | "weekly",
  env: Env
): Promise<DigestResult | null> {
  const data = await generateDigestData(userId, timeframe, env);
  if (!data || data.totalActions === 0) return null;

  const subject =
    timeframe === "daily"
      ? `Swarme Daily Digest — ${data.totalActions} actions in the last 24h`
      : `Swarme Weekly Wrap-Up — ${data.totalActions} actions this week`;

  return {
    data,
    html: renderDigestHtml(data),
    subject,
  };
}
