/**
 * ============================================================
 * Swarme — Phase 27: Retention Notification Templates
 * ============================================================
 *
 * High-converting email & SMS templates for anti-churn campaigns.
 * Templates are parameterized with user data and magic link URLs.
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// Template Types
// ─────────────────────────────────────────────────────────────

export interface RetentionTemplateData {
  userName: string;        // First part of email or display name
  daysSinceLogin: number;
  magicLinkUrl: string;
  competitorInsight?: string; // Optional hook from market scan
}

// ─────────────────────────────────────────────────────────────
// Email Templates (branded HTML)
// ─────────────────────────────────────────────────────────────

/**
 * Tier 1: Gentle nudge (7-14 days inactive)
 * Warm, value-reminder tone — no urgency.
 */
export function buildGentleNudgeEmail(data: RetentionTemplateData): { subject: string; html: string } {
  const { userName, daysSinceLogin, magicLinkUrl, competitorInsight } = data;

  const competitorHook = competitorInsight
    ? `<tr><td style="padding:0 40px 24px;">
        <div style="background:#1e293b;border-radius:8px;padding:16px 20px;border-left:3px solid #f59e0b;">
          <p style="margin:0;font-size:13px;color:#f59e0b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">⚡ Market Alert</p>
          <p style="margin:8px 0 0;font-size:14px;color:#cbd5e1;line-height:1.6;">${competitorInsight}</p>
        </div>
      </td></tr>`
    : "";

  return {
    subject: `${userName}, your swarm has been busy while you were away`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2a2d37;">
          <table width="100%"><tr>
            <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">&#x2B21; Swarme</td>
            <td align="right"><span style="display:inline-block;background:#22c55e20;color:#22c55e;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;">RETENTION</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px 40px 16px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">Hey ${userName}, it's been ${daysSinceLogin} days 👋</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.7;">Your AI swarm has been running in the background — monitoring your visibility, tracking competitors, and finding growth opportunities. Here's what you've been missing:</p>
          <ul style="margin:0 0 24px;padding-left:20px;color:#a1a1aa;font-size:14px;line-height:2;">
            <li>New visibility gaps detected and queued for action</li>
            <li>Competitor pricing and feature changes tracked</li>
            <li>Content opportunities identified from trending queries</li>
          </ul>
        </td></tr>
        ${competitorHook}
        <tr><td style="padding:0 40px 32px;" align="center">
          <a href="${magicLinkUrl}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">
            Jump Back In — No Password Needed &rarr;
          </a>
          <p style="margin:12px 0 0;font-size:12px;color:#52525b;">This link expires in 15 minutes.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #2a2d37;">
          <p style="margin:0;font-size:12px;color:#52525b;line-height:1.5;">
            You're receiving this because your account has been inactive for ${daysSinceLogin} days.
            <a href="https://swarme.io/#/settings" style="color:#22c55e;text-decoration:none;">Manage preferences</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

/**
 * Tier 2: Urgency escalation (15-30 days inactive)
 * Highlights missed opportunities and competitor moves.
 */
export function buildUrgencyEmail(data: RetentionTemplateData): { subject: string; html: string } {
  const { userName, daysSinceLogin, magicLinkUrl, competitorInsight } = data;

  const competitorSection = competitorInsight
    ? `<tr><td style="padding:0 40px 24px;">
        <div style="background:#1e293b;border-radius:8px;padding:16px 20px;border-left:3px solid #ef4444;">
          <p style="margin:0;font-size:13px;color:#ef4444;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">🚨 Competitive Threat</p>
          <p style="margin:8px 0 0;font-size:14px;color:#cbd5e1;line-height:1.6;">${competitorInsight}</p>
        </div>
      </td></tr>`
    : "";

  return {
    subject: `⚠️ ${userName}, your competitors aren't sleeping`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1d27;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #2a2d37;">
          <table width="100%"><tr>
            <td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">&#x2B21; Swarme</td>
            <td align="right"><span style="display:inline-block;background:#ef444420;color:#ef4444;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;">URGENT</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px 40px 16px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">${userName}, ${daysSinceLogin} days of visibility lost</h1>
          <p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.7;">While your swarm has been paused, your competitors have been making moves. Every day you're not optimizing, they're gaining ground on your keywords.</p>
          <div style="background:#0f1117;border-radius:8px;padding:20px;margin:0 0 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:28px;font-weight:700;color:#ef4444;">${daysSinceLogin}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Days Inactive</p>
                </td>
                <td style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:28px;font-weight:700;color:#f59e0b;">~${Math.round(daysSinceLogin * 2.5)}</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Missed Actions</p>
                </td>
                <td style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:28px;font-weight:700;color:#22c55e;">3</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.5px;">Threats Found</p>
                </td>
              </tr>
            </table>
          </div>
        </td></tr>
        ${competitorSection}
        <tr><td style="padding:0 40px 32px;" align="center">
          <a href="${magicLinkUrl}" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:14px 32px;border-radius:8px;">
            Reactivate My Swarm Now &rarr;
          </a>
          <p style="margin:12px 0 0;font-size:12px;color:#52525b;">One-click login — this link expires in 15 minutes.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #2a2d37;">
          <p style="margin:0;font-size:12px;color:#52525b;line-height:1.5;">
            This is an automated retention alert because your account has been inactive for ${daysSinceLogin} days.
            <a href="https://swarme.io/#/settings" style="color:#22c55e;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

// ─────────────────────────────────────────────────────────────
// SMS Templates
// ─────────────────────────────────────────────────────────────

/**
 * Tier 1: Gentle nudge SMS (7-14 days)
 */
export function buildGentleNudgeSms(data: RetentionTemplateData): string {
  return `Hey ${data.userName}! Your Swarme AI swarm found new opportunities while you were away (${data.daysSinceLogin}d). Jump back in: ${data.magicLinkUrl}`;
}

/**
 * Tier 2: Urgency SMS (15-30 days)
 */
export function buildUrgencySms(data: RetentionTemplateData): string {
  return `⚠️ ${data.userName}, your competitors are gaining ground. ${data.daysSinceLogin} days inactive = ~${Math.round(data.daysSinceLogin * 2.5)} missed optimizations. Reactivate now: ${data.magicLinkUrl}`;
}

// ─────────────────────────────────────────────────────────────
// Template Selector
// ─────────────────────────────────────────────────────────────

export function selectRetentionTemplate(daysSinceLogin: number): "gentle_nudge" | "urgency" {
  if (daysSinceLogin <= 14) return "gentle_nudge";
  return "urgency";
}
