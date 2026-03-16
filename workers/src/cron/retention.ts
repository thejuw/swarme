/**
 * ============================================================
 * Swarme — Phase 27: Daily Retention Cron Job
 * ============================================================
 *
 * Runs daily at 14:00 UTC (0 14 * * *).
 *
 * Pipeline:
 *   1. Query Users whose last_login_at is 7-30 days ago
 *   2. For each at-risk user, run a proactive competitor scan
 *   3. Generate a magic link (one-time JWT)
 *   4. Select the appropriate email/SMS template (gentle vs urgent)
 *   5. Dispatch notifications via the existing Resend/Twilio engine
 *   6. Log a Retention_Event for each action
 *
 * Safety constraints:
 *   - Only processes users with notify_email = 1 (respects prefs)
 *   - Magic links expire in 15 minutes
 *   - Max 50 users per cron run to stay within Worker CPU limits
 * ============================================================
 */

import type { Env } from "../index";
import { createMagicLink } from "../auth";
import { runProactiveMarketScan } from "../utils/researcher";
import { sendUpdateEmail, sendSmsUpdate } from "../utils/notifications";
import {
  buildGentleNudgeEmail,
  buildUrgencyEmail,
  buildGentleNudgeSms,
  buildUrgencySms,
  selectRetentionTemplate,
  type RetentionTemplateData,
} from "../utils/retention-templates";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AtRiskUser {
  id: string;
  email: string;
  phone_number: string | null;
  notify_email: number;
  notify_sms: number;
  last_login_at: string;
  plan: string;
}

export interface RetentionCronResult {
  usersScanned: number;
  notificationsSent: number;
  magicLinksSent: number;
  competitorScansRun: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────

export async function handleRetentionCron(env: Env): Promise<RetentionCronResult> {
  const result: RetentionCronResult = {
    usersScanned: 0,
    notificationsSent: 0,
    magicLinksSent: 0,
    competitorScansRun: 0,
    errors: 0,
  };

  console.log("[Retention] Starting daily retention scan...");

  try {
    // ── Step 1: Find at-risk users (7-30 days inactive) ──
    // Users who:
    //   - Have a last_login_at older than 7 days
    //   - But not older than 30 days (beyond 30 days = likely churned)
    //   - Have email notifications enabled
    //   - Are active (not suspended)
    const atRiskUsers = await env.DB.prepare(`
      SELECT u.id, u.email, u.phone_number, u.notify_email, u.notify_sms,
             u.last_login_at, u.plan
      FROM Users u
      WHERE u.last_login_at IS NOT NULL
        AND u.last_login_at < datetime('now', '-7 days')
        AND u.last_login_at > datetime('now', '-30 days')
        AND u.status = 'active'
        AND u.notify_email = 1
        AND NOT EXISTS (
          SELECT 1 FROM Retention_Events re
          WHERE re.user_id = u.id
            AND re.event_type IN ('winback_sent', 'magic_link_sent')
            AND re.created_at > datetime('now', '-3 days')
        )
      ORDER BY u.last_login_at ASC
      LIMIT 50
    `).all();

    const users = (atRiskUsers.results || []) as AtRiskUser[];
    result.usersScanned = users.length;

    if (users.length === 0) {
      console.log("[Retention] No at-risk users found. All clear.");
      return result;
    }

    console.log(`[Retention] Found ${users.length} at-risk user(s)`);

    // ── Step 2: Run one market scan per cron run (shared across users) ──
    let competitorInsight: string | undefined;
    try {
      // Use the first active project for the market scan
      const project = await env.DB.prepare(
        "SELECT id FROM Projects WHERE is_active = 1 LIMIT 1"
      ).first<{ id: string }>();

      if (project) {
        const scan = await runProactiveMarketScan(project.id, env);
        result.competitorScansRun = 1;

        // Extract the highest-severity competitor signal for the email hook
        const highSeverity = scan.competitors.find((c) => c.severity === "high");
        if (highSeverity) {
          competitorInsight = `${highSeverity.name}: ${highSeverity.signal}`;
        }
      }
    } catch (err) {
      console.error("[Retention] Market scan failed:", err instanceof Error ? err.message : err);
      result.errors++;
    }

    // ── Step 3-5: Process each user ──
    for (const user of users) {
      try {
        const daysSinceLogin = Math.floor(
          (Date.now() - new Date(user.last_login_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const userName = user.email.split("@")[0];
        const tier = selectRetentionTemplate(daysSinceLogin);

        // Generate magic link
        const magicLink = await createMagicLink(user.id, user.email, env);
        result.magicLinksSent++;

        const templateData: RetentionTemplateData = {
          userName,
          daysSinceLogin,
          magicLinkUrl: magicLink.url,
          competitorInsight,
        };

        // ── Email ──
        if (user.notify_email === 1) {
          const email =
            tier === "gentle_nudge"
              ? buildGentleNudgeEmail(templateData)
              : buildUrgencyEmail(templateData);

          const sent = await sendUpdateEmail(user.email, email.subject, email.html, env);
          if (sent) result.notificationsSent++;
        }

        // ── SMS ──
        if (user.notify_sms === 1 && user.phone_number) {
          const smsBody =
            tier === "gentle_nudge"
              ? buildGentleNudgeSms(templateData)
              : buildUrgencySms(templateData);

          const sent = await sendSmsUpdate(user.phone_number, smsBody, env);
          if (sent) result.notificationsSent++;
        }

        // ── Log Retention Event ──
        const eventId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
        const channels: string[] = [];
        if (user.notify_email === 1) channels.push("email");
        if (user.notify_sms === 1 && user.phone_number) channels.push("sms");

        await env.DB.prepare(
          `INSERT INTO Retention_Events (id, user_id, event_type, channel, metadata)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        ).bind(
          eventId,
          user.id,
          "winback_sent",
          channels.join(",") || "email",
          JSON.stringify({
            tier,
            days_inactive: daysSinceLogin,
            magic_link_expires: magicLink.expiresAt,
            competitor_insight: competitorInsight || null,
          })
        ).run();

        console.log(`[Retention] Sent ${tier} winback to ${user.email} (${daysSinceLogin}d inactive)`);
      } catch (err) {
        console.error(`[Retention] Error processing user ${user.id}:`, err instanceof Error ? err.message : err);
        result.errors++;
      }
    }
  } catch (err) {
    console.error("[Retention] Fatal error:", err instanceof Error ? err.message : err);
    result.errors++;
  }

  console.log(
    `[Retention] Complete — ${result.usersScanned} scanned, ${result.notificationsSent} notifications, ${result.magicLinksSent} magic links, ${result.errors} errors`
  );

  return result;
}
