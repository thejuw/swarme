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
import { createThrottledFetch } from "../utils/throttle";
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
    const throttledResend = createThrottledFetch("resend", env.CONFIG_KV);
    const res = await throttledResend("https://api.resend.com/emails", {
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

// Resend rate limits: Free=2 req/s, Pro=10 req/s. We use a 600ms
// delay between sends to stay safely under the free-tier limit.
const BATCH_SIZE = 10;            // Process 10 users per batch
const INTER_SEND_DELAY_MS = 600;  // 600ms between individual sends (~1.6/s)
const INTER_BATCH_DELAY_MS = 2000; // 2s pause between batches
const MAX_EMAILS_PER_CRON = 500;  // Safety cap per cron invocation

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    // LIMIT to MAX_EMAILS_PER_CRON to avoid exceeding Worker CPU time
    const { results: users } = await env.DB.prepare(
      `SELECT id, email FROM Users
       WHERE alert_frequency = ?1
         AND notify_email = 1
         AND status = 'active'
       LIMIT ?2`
    )
      .bind(timeframe, MAX_EMAILS_PER_CRON)
      .all<DigestUser>();

    result.usersQueried = users?.length ?? 0;
    console.log(`[Newsletter] ${timeframe}: Found ${result.usersQueried} subscribed users`);

    if (!users || users.length === 0) return result;

    // Process users in rate-limited batches to respect Resend API limits.
    // Each batch: generate + send emails sequentially with inter-send delays,
    // then pause between batches to avoid burst throttling.
    for (let batchStart = 0; batchStart < users.length; batchStart += BATCH_SIZE) {
      const batch = users.slice(batchStart, batchStart + BATCH_SIZE);

      for (const user of batch) {
        try {
          const digest = await generateDigestEmail(user.id, timeframe, env);

          if (!digest) {
            result.skipped++;
            continue;
          }

          const sent = await sendDigestEmail(user.email, digest.subject, digest.html, env);
          if (sent) {
            result.emailsSent++;
          } else {
            result.errors++;
          }

          // Rate limit: wait between sends to stay under Resend's req/s limit
          await sleep(INTER_SEND_DELAY_MS);
        } catch (err) {
          console.error(`[Newsletter] Error for user ${user.id}:`, err instanceof Error ? err.message : err);
          result.errors++;
        }
      }

      // Pause between batches if there are more to process
      if (batchStart + BATCH_SIZE < users.length) {
        console.log(`[Newsletter] Batch ${Math.floor(batchStart / BATCH_SIZE) + 1} complete, pausing...`);
        await sleep(INTER_BATCH_DELAY_MS);
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
