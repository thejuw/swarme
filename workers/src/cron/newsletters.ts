/**
 * ============================================================
 * Phase 44: Newsletter Cron Dispatchers
 * ============================================================
 *
 * Two cron-triggered functions:
 *   1. Daily digest  — 17:00 UTC every day
 *   2. Weekly digest — 17:00 UTC every Friday
 *
 * Each queries Users with the matching alert_frequency,
 * generates a personalized digest email via digest.ts,
 * and dispatches it through Resend.
 *
 * Strict constraint: digest emails are informational only.
 * They do NOT trigger any autonomous publishing or content changes.
 * ============================================================
 */

import type { Env } from "../index";
import { generateDigestEmail } from "../utils/digest";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DigestUser {
  id: string;
  email: string;
}

interface DigestCronResult {
  timeframe: "daily" | "weekly";
  usersQueried: number;
  emailsSent: number;
  skipped: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────
// Send a single digest email via Resend
// ─────────────────────────────────────────────────────────────

async function sendDigestEmail(
  to: string,
  subject: string,
  html: string,
  env: Env
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Newsletter] RESEND_API_KEY not configured — skipping email");
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Swarme <digest@swarme.io>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Newsletter] Resend error (${res.status}): ${errText}`);
      return false;
    }

    console.log(`[Newsletter] Digest sent to ${to}: "${subject}"`);
    return true;
  } catch (err) {
    console.error("[Newsletter] Send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Core dispatcher — shared between daily & weekly
// ─────────────────────────────────────────────────────────────

async function dispatchDigests(
  timeframe: "daily" | "weekly",
  env: Env
): Promise<DigestCronResult> {
  const result: DigestCronResult = {
    timeframe,
    usersQueried: 0,
    emailsSent: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Query users opted into this frequency who have email enabled
    const { results: users } = await env.DB.prepare(
      `SELECT id, email FROM Users
       WHERE alert_frequency = ?1
         AND notify_email = 1
         AND status = 'active'`
    )
      .bind(timeframe)
      .all<DigestUser>();

    result.usersQueried = users?.length ?? 0;
    console.log(`[Newsletter] ${timeframe}: Found ${result.usersQueried} subscribed users`);

    if (!users || users.length === 0) return result;

    // Process each user (sequential to avoid Resend rate limits)
    for (const user of users) {
      try {
        const digest = await generateDigestEmail(user.id, timeframe, env);

        if (!digest) {
          // No activity in the timeframe — skip silently
          result.skipped++;
          continue;
        }

        const sent = await sendDigestEmail(user.email, digest.subject, digest.html, env);
        if (sent) {
          result.emailsSent++;
        } else {
          result.errors++;
        }
      } catch (err) {
        console.error(`[Newsletter] Error for user ${user.id}:`, err instanceof Error ? err.message : err);
        result.errors++;
      }
    }
  } catch (err) {
    console.error(`[Newsletter] Fatal error in ${timeframe} dispatch:`, err);
  }

  console.log(
    `[Newsletter] ${timeframe} complete — ` +
    `${result.emailsSent} sent, ${result.skipped} skipped, ${result.errors} errors`
  );

  return result;
}

// ─────────────────────────────────────────────────────────────
// Exported cron handlers
// ─────────────────────────────────────────────────────────────

/** Daily digest — triggered at 17:00 UTC */
export async function handleDailyDigest(env: Env): Promise<DigestCronResult> {
  console.log("[Newsletter] Starting daily digest dispatch...");
  return dispatchDigests("daily", env);
}

/** Weekly digest — triggered at 17:00 UTC on Fridays */
export async function handleWeeklyDigest(env: Env): Promise<DigestCronResult> {
  console.log("[Newsletter] Starting weekly digest dispatch...");
  return dispatchDigests("weekly", env);
}
