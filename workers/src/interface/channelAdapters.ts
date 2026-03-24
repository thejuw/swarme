/**
 * ============================================================
 * Swarme — Phase 68: Channel Response Adapters
 * ============================================================
 *
 * Translates standardized response payloads into platform-specific
 * formats for bidirectional communication:
 *
 *   Slack    → Block Kit JSON
 *   Teams    → Adaptive Cards
 *   WhatsApp → Plain text (API limits)
 *   Telegram → Markdown v2
 *   Discord  → Embeds
 *   SMS      → Plain text (160 char segments)
 *
 * Each adapter takes a response string + status and returns
 * the platform-native payload for delivery.
 * ============================================================
 */

// ── Types ────────────────────────────────────────────────────

export type ChannelType = "slack" | "teams" | "whatsapp" | "telegram" | "discord" | "sms";

export type ResponseStatus = "success" | "error" | "info" | "warning";

// ── Main Formatter ───────────────────────────────────────────

export function formatResponse(
  channel: ChannelType,
  text: string,
  status: ResponseStatus = "info",
): string | Record<string, any> {
  switch (channel) {
    case "slack":
      return formatSlack(text, status);
    case "teams":
      return formatTeams(text, status);
    case "whatsapp":
      return formatWhatsApp(text, status);
    case "telegram":
      return formatTelegram(text, status);
    case "discord":
      return formatDiscord(text, status);
    case "sms":
      return formatSms(text, status);
    default:
      return text;
  }
}

// ── Slack Block Kit ──────────────────────────────────────────

function formatSlack(text: string, status: ResponseStatus): Record<string, any> {
  const emoji = STATUS_EMOJI[status];
  const color = SLACK_COLORS[status];

  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *Swarme ChatOps*\n${text}`,
        },
      },
    ],
    attachments: [
      {
        color,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `_${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC_`,
              },
            ],
          },
        ],
      },
    ],
    text: `${emoji} ${text}`,  // Fallback for notifications
  };
}

const SLACK_COLORS: Record<ResponseStatus, string> = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#3b82f6",
  warning: "#f59e0b",
};

// ── Microsoft Teams (Adaptive Card) ──────────────────────────

function formatTeams(text: string, status: ResponseStatus): Record<string, any> {
  const emoji = STATUS_EMOJI[status];
  const color = TEAMS_COLORS[status];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `${emoji} Swarme ChatOps`,
              weight: "Bolder",
              size: "Medium",
              color,
            },
            {
              type: "TextBlock",
              text,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: new Date().toISOString(),
              size: "Small",
              isSubtle: true,
            },
          ],
        },
      },
    ],
  };
}

const TEAMS_COLORS: Record<ResponseStatus, string> = {
  success: "Good",
  error: "Attention",
  info: "Default",
  warning: "Warning",
};

// ── WhatsApp (Plain Text) ────────────────────────────────────

function formatWhatsApp(text: string, status: ResponseStatus): string {
  const emoji = STATUS_EMOJI[status];
  return `${emoji} *Swarme*\n\n${text}`;
}

// ── Telegram (Markdown) ──────────────────────────────────────

function formatTelegram(text: string, status: ResponseStatus): string {
  const emoji = STATUS_EMOJI[status];
  // Escape special Telegram Markdown characters
  const escaped = text
    .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
  return `${emoji} *Swarme ChatOps*\n\n${escaped}`;
}

// ── Discord (Embed) ──────────────────────────────────────────

function formatDiscord(text: string, status: ResponseStatus): Record<string, any> {
  return {
    embeds: [
      {
        title: "Swarme ChatOps",
        description: text,
        color: DISCORD_COLORS[status],
        timestamp: new Date().toISOString(),
        footer: { text: "Swarme Edge Platform" },
      },
    ],
  };
}

const DISCORD_COLORS: Record<ResponseStatus, number> = {
  success: 0x22c55e,
  error: 0xef4444,
  info: 0x3b82f6,
  warning: 0xf59e0b,
};

// ── SMS (Plain Text, 160 char segments) ──────────────────────

function formatSms(text: string, status: ResponseStatus): string {
  const prefix = status === "error" ? "ERR: " : "";
  const msg = `${prefix}Swarme: ${text}`;
  // Truncate to SMS-friendly length
  return msg.length > 1500 ? msg.slice(0, 1497) + "..." : msg;
}

// ── Shared ───────────────────────────────────────────────────

const STATUS_EMOJI: Record<ResponseStatus, string> = {
  success: "\u2705",
  error: "\u274c",
  info: "\u2139\ufe0f",
  warning: "\u26a0\ufe0f",
};
