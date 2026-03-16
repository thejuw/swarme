/**
 * ============================================================
 * Swarme — Phase 20: Omnichannel Notification Engine
 * ============================================================
 *
 * Provides edge-compatible dispatchers for email (Resend) and
 * SMS (Twilio) notifications. The master `notifyUser()` function
 * queries the user's preferences from D1 and conditionally fires
 * the appropriate channels.
 *
 * All external calls use native `fetch` — no Node.js dependencies.
 * ============================================================
 */

import type { Env } from "../index";
import { createThrottledFetch } from "./throttle";

// ─────────────────────────────────────────────────────────────
// Email Notification (Resend)
// ─────────────────────────────────────────────────────────────

/**
 * Build a branded HTML email body for platform update notifications.
 * Matches the Swarme emerald-green dark aesthetic.
 */
function buildUpdateEmailHtml(title: string, message: string): string {
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
                SWARM UPDATE
              </span>
            </td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">
            ${title}
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.7;">
            ${message}
          </p>
          <a href="https://swarme.io/#/dashboard"
             style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
            Open Command Center &rarr;
          </a>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #2a2d37;">
          <p style="margin:0;font-size:12px;color:#52525b;line-height:1.5;">
            You received this because email notifications are enabled in your
            <a href="https://swarme.io/#/settings" style="color:#22c55e;text-decoration:none;">notification preferences</a>.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send a platform update email via Resend.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendUpdateEmail(
  to: string,
  title: string,
  message: string,
  env: Env
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Notifications] RESEND_API_KEY not configured — skipping email");
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
        from: "Swarme <notifications@swarme.io>",
        to: [to],
        subject: `Swarme — ${title}`,
        html: buildUpdateEmailHtml(title, message),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Notifications] Resend API error (${res.status}): ${errText}`);
      return false;
    }

    console.log(`[Notifications] Email sent to ${to}: "${title}"`);
    return true;
  } catch (err) {
    console.error("[Notifications] Email send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// SMS Notification (Twilio)
// ─────────────────────────────────────────────────────────────

/**
 * Send an SMS via Twilio REST API using native fetch.
 * Uses Basic Auth + URL-encoded form data per Twilio spec.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendSmsUpdate(
  to: string,
  message: string,
  env: Env
): Promise<boolean> {
  const accountSid = (env as any).TWILIO_ACCOUNT_SID as string | undefined;
  const authToken = (env as any).TWILIO_AUTH_TOKEN as string | undefined;
  const fromNumber = (env as any).TWILIO_FROM_NUMBER as string | undefined;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[Notifications] Twilio credentials not configured — skipping SMS");
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: `[Swarme] ${message}`,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(accountSid + ":" + authToken)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Notifications] Twilio API error (${res.status}): ${errText}`);
      return false;
    }

    console.log(`[Notifications] SMS sent to ${to}: "${message}"`);
    return true;
  } catch (err) {
    console.error("[Notifications] SMS send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Master Dispatcher
// ─────────────────────────────────────────────────────────────

/** Shape of user row with notification preferences */
interface UserPrefs {
  id: string;
  email: string;
  phone_number: string | null;
  notify_email: number; // D1 BOOLEAN = 0 | 1
  notify_sms: number;
}

/**
 * Master notification dispatcher.
 *
 * Queries the user's preferences from D1 and conditionally fires
 * email and/or SMS based on what the user has toggled ON.
 *
 * @param userId  - The user's ID (Users.id)
 * @param title   - Short notification title (used as email subject suffix)
 * @param message - The notification body text
 * @param env     - Worker env bindings
 */
export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  env: Env
): Promise<{ emailSent: boolean; smsSent: boolean }> {
  let emailSent = false;
  let smsSent = false;

  try {
    // Fetch user preferences from D1
    const user = await env.DB.prepare(
      "SELECT id, email, phone_number, notify_email, notify_sms FROM Users WHERE id = ?1"
    )
      .bind(userId)
      .first<UserPrefs>();

    if (!user) {
      console.warn(`[Notifications] User ${userId} not found — skipping notification`);
      return { emailSent, smsSent };
    }

    // ── Email channel ──
    if (user.notify_email === 1 && user.email) {
      emailSent = await sendUpdateEmail(user.email, title, message, env);
    }

    // ── SMS channel ──
    if (user.notify_sms === 1 && user.phone_number) {
      smsSent = await sendSmsUpdate(user.phone_number, message, env);
    }
  } catch (err) {
    console.error("[Notifications] Master dispatcher error:", err instanceof Error ? err.message : err);
  }

  return { emailSent, smsSent };
}
