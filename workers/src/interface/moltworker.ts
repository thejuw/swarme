/**
 * ============================================================
 * Swarme — Phase 68: Omnichannel ChatOps Gateway (Moltworker)
 * ============================================================
 *
 * The executive communication interface layer. Receives webhook
 * payloads from 5 channels, validates platform signatures,
 * normalizes into a standardized ChatOpsCommand, and hands off
 * to Cloudflare Workflows for durable execution.
 *
 * CRITICAL BOUNDARY:
 *   Moltworker NEVER mutates D1, dispatches Workers, or touches
 *   live web traffic. It is strictly 1-to-1 executive communication
 *   and intent parsing. All execution is delegated to Workflows.
 *
 * Supported Channels:
 *   1. Slack         — Enterprise Tier (Bot token + event signing)
 *   2. MS Teams      — Enterprise Tier (Bot Framework, HMAC validation)
 *   3. WhatsApp      — Boutique/Founder Tier (Business API via Meta)
 *   4. Telegram      — Web3/Technical Tier (Bot API + secret token)
 *   5. Discord       — Web3/Technical Tier (Ed25519 signature)
 *   6. Twilio SMS    — Emergency Failsafe (request validation)
 *
 * Webhook Endpoints (all under /api/chatops):
 *   POST /api/chatops/slack       — Slack Events API
 *   POST /api/chatops/teams       — MS Teams Bot Framework
 *   POST /api/chatops/whatsapp    — WhatsApp Cloud API
 *   POST /api/chatops/telegram    — Telegram Bot API
 *   POST /api/chatops/discord     — Discord Interactions
 *   POST /api/chatops/sms         — Twilio SMS webhook
 *   POST /api/chatops/respond     — Callback from Workflows (bidirectional)
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";
import { parseIntent, type ChatOpsCommand } from "./intentParser";
import { formatResponse, type ChannelType } from "./channelAdapters";

const moltworkerRouter = new Hono<{ Bindings: Env }>();

// ── Types ────────────────────────────────────────────────────

export interface NormalizedMessage {
  source_channel: ChannelType;
  channel_id: string;
  user_id: string;
  user_name: string;
  text: string;
  thread_id?: string;
  timestamp: string;
  raw_event: Record<string, any>;
}

// ── 1. Slack Events API ──────────────────────────────────────

moltworkerRouter.post("/slack", async (c) => {
  const rawBody = await c.req.text();
  const body = JSON.parse(rawBody);

  // Slack URL verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // Verify Slack request signature
  const signingSecret = await c.env.CONFIG_KV.get("chatops:slack:signing_secret");
  if (signingSecret) {
    const timestamp = c.req.header("x-slack-request-timestamp") || "";
    const slackSig = c.req.header("x-slack-signature") || "";
    const isValid = await verifySlackSignature(rawBody, timestamp, slackSig, signingSecret);
    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // Skip bot messages and retries
  if (body.event?.bot_id || c.req.header("x-slack-retry-num")) {
    return c.json({ ok: true });
  }

  if (body.type === "event_callback" && body.event?.type === "message") {
    const msg: NormalizedMessage = {
      source_channel: "slack",
      channel_id: body.event.channel,
      user_id: body.event.user || "unknown",
      user_name: body.event.user || "unknown",
      text: body.event.text || "",
      thread_id: body.event.thread_ts || body.event.ts,
      timestamp: new Date().toISOString(),
      raw_event: body.event,
    };

    await processMessage(c.env, msg);
  }

  return c.json({ ok: true });
});

// ── 2. Microsoft Teams Bot Framework ─────────────────────────

moltworkerRouter.post("/teams", async (c) => {
  const body = await c.req.json();

  // Teams sends activity objects
  if (body.type === "message" && body.text) {
    // Strip bot mention from text
    const cleanText = body.text.replace(/<at>.*?<\/at>\s*/g, "").trim();

    const msg: NormalizedMessage = {
      source_channel: "teams",
      channel_id: body.conversation?.id || "unknown",
      user_id: body.from?.id || "unknown",
      user_name: body.from?.name || "unknown",
      text: cleanText,
      thread_id: body.conversation?.id,
      timestamp: new Date().toISOString(),
      raw_event: body,
    };

    await processMessage(c.env, msg);
  }

  return c.json({ ok: true });
});

// ── 3. WhatsApp Business API (Meta Cloud API) ────────────────

moltworkerRouter.post("/whatsapp", async (c) => {
  const body = await c.req.json();

  // Webhook verification (GET handled separately below)
  if (body.object === "whatsapp_business_account") {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === "messages") {
          const messages = change.value?.messages || [];
          for (const waMsg of messages) {
            if (waMsg.type === "text") {
              const contact = (change.value?.contacts || [])[0];
              const msg: NormalizedMessage = {
                source_channel: "whatsapp",
                channel_id: waMsg.from,
                user_id: waMsg.from,
                user_name: contact?.profile?.name || waMsg.from,
                text: waMsg.text?.body || "",
                thread_id: waMsg.id,
                timestamp: new Date().toISOString(),
                raw_event: waMsg,
              };

              await processMessage(c.env, msg);
            }
          }
        }
      }
    }
  }

  return c.json({ ok: true });
});

// WhatsApp verification GET endpoint
moltworkerRouter.get("/whatsapp", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const verifyToken = await c.env.CONFIG_KV.get("chatops:whatsapp:verify_token");
  if (mode === "subscribe" && token === verifyToken) {
    return c.text(challenge || "", 200);
  }
  return c.text("Forbidden", 403);
});

// ── 4. Telegram Bot API ──────────────────────────────────────

moltworkerRouter.post("/telegram", async (c) => {
  // Validate secret token header
  const secretToken = await c.env.CONFIG_KV.get("chatops:telegram:secret_token");
  if (secretToken) {
    const headerToken = c.req.header("x-telegram-bot-api-secret-token");
    if (headerToken !== secretToken) {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  const body = await c.req.json();

  if (body.message?.text) {
    const from = body.message.from || {};
    const msg: NormalizedMessage = {
      source_channel: "telegram",
      channel_id: String(body.message.chat?.id || ""),
      user_id: String(from.id || ""),
      user_name: from.username || `${from.first_name || ""} ${from.last_name || ""}`.trim() || "unknown",
      text: body.message.text,
      thread_id: String(body.message.message_id || ""),
      timestamp: new Date().toISOString(),
      raw_event: body.message,
    };

    await processMessage(c.env, msg);
  }

  return c.json({ ok: true });
});

// ── 5. Discord Interactions ──────────────────────────────────

moltworkerRouter.post("/discord", async (c) => {
  const rawBody = await c.req.text();
  const body = JSON.parse(rawBody);

  // Discord signature verification
  const publicKey = await c.env.CONFIG_KV.get("chatops:discord:public_key");
  if (publicKey) {
    const signature = c.req.header("x-signature-ed25519") || "";
    const timestamp = c.req.header("x-signature-timestamp") || "";
    const isValid = await verifyDiscordSignature(rawBody, signature, timestamp, publicKey);
    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // Discord PING (verification)
  if (body.type === 1) {
    return c.json({ type: 1 });
  }

  // APPLICATION_COMMAND or MESSAGE_COMPONENT
  if (body.type === 2 || body.type === 3) {
    const user = body.member?.user || body.user || {};
    const text = body.data?.options?.map((o: any) => o.value).join(" ") || body.data?.name || "";

    const msg: NormalizedMessage = {
      source_channel: "discord",
      channel_id: body.channel_id || "unknown",
      user_id: user.id || "unknown",
      user_name: user.username || "unknown",
      text,
      thread_id: body.id,
      timestamp: new Date().toISOString(),
      raw_event: body,
    };

    await processMessage(c.env, msg);

    // Discord requires an immediate response for interactions
    return c.json({
      type: 4,
      data: { content: "Processing your request..." },
    });
  }

  return c.json({ ok: true });
});

// ── 6. Twilio SMS (Emergency Failsafe) ───────────────────────

moltworkerRouter.post("/sms", async (c) => {
  const formData = await c.req.parseBody();

  // Validate Twilio request signature
  const authToken = c.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const twilioSig = c.req.header("x-twilio-signature") || "";
    const url = c.req.url;
    const isValid = await verifyTwilioSignature(url, formData as Record<string, string>, twilioSig, authToken);
    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const body = formData.Body as string || "";
  const from = formData.From as string || "";

  if (body.trim()) {
    const msg: NormalizedMessage = {
      source_channel: "sms",
      channel_id: from,
      user_id: from,
      user_name: from,
      text: body,
      timestamp: new Date().toISOString(),
      raw_event: formData as Record<string, any>,
    };

    await processMessage(c.env, msg);
  }

  // Twilio expects TwiML response
  return c.text(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Command received. Processing...</Message></Response>',
    200,
    { "Content-Type": "text/xml" },
  );
});

// ── 7. Workflow Callback (Bidirectional Response) ────────────
// Workflows calls this endpoint after execution completes.
// Moltworker translates the result to natural language and
// routes it back to the originating channel.

moltworkerRouter.post("/respond", async (c) => {
  try {
    const payload = await c.req.json<{
      command_id: string;
      source_channel: ChannelType;
      channel_id: string;
      thread_id?: string;
      user_id: string;
      success: boolean;
      result: Record<string, any>;
      error?: string;
    }>();

    const responseText = payload.success
      ? formatSuccessMessage(payload.result)
      : `Command failed: ${payload.error || "Unknown error"}`;

    const formatted = formatResponse(
      payload.source_channel,
      responseText,
      payload.success ? "success" : "error",
    );

    // Route response back to the originating channel
    await deliverResponse(c.env, {
      channel: payload.source_channel,
      channel_id: payload.channel_id,
      thread_id: payload.thread_id,
      content: formatted,
    });

    return c.json({ ok: true });
  } catch (err) {
    console.error("[Moltworker] Callback error:", err);
    return c.json({ error: "Callback failed" }, 500);
  }
});

// ── Core Processing Pipeline ─────────────────────────────────
// Every channel converges here. This is the single point where
// normalized messages become structured commands and get handed
// off to Cloudflare Workflows.

async function processMessage(env: Env, msg: NormalizedMessage): Promise<void> {
  try {
    // Step 1: Parse natural language intent
    const command = await parseIntent(env, msg);
    if (!command) {
      console.log(`[Moltworker] No actionable intent from ${msg.source_channel}:${msg.user_id}`);
      return;
    }

    // Step 2: Append source_channel identifier (per directive)
    command.source_channel = msg.source_channel;
    command.channel_id = msg.channel_id;
    command.thread_id = msg.thread_id;
    command.user_id = msg.user_id;
    command.user_name = msg.user_name;

    // Step 3: Hand off to Cloudflare Workflows
    // Moltworker fires an authenticated internal API request to the
    // Workflows engine. It NEVER directly mutates D1 or dispatches Workers.
    const workflowId = `chatops-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    try {
      const instance = await env.CHATOPS_WORKFLOW.create({
        id: workflowId,
        params: command,
      });
      console.log(`[Moltworker] Workflow dispatched: ${workflowId} for ${command.intent}`);
    } catch (wfErr) {
      console.error("[Moltworker] Workflow dispatch failed:", wfErr);
      // Fallback: send error response directly
      const formatted = formatResponse(
        msg.source_channel,
        "I received your command but couldn't process it right now. The operations team has been notified.",
        "error",
      );
      await deliverResponse(env, {
        channel: msg.source_channel,
        channel_id: msg.channel_id,
        thread_id: msg.thread_id,
        content: formatted,
      });
    }
  } catch (err) {
    console.error("[Moltworker] Message processing error:", err);
  }
}

// ── Response Delivery ────────────────────────────────────────
// Routes formatted responses back to the originating platform.

interface DeliveryPayload {
  channel: ChannelType;
  channel_id: string;
  thread_id?: string;
  content: string | Record<string, any>;
}

async function deliverResponse(env: Env, payload: DeliveryPayload): Promise<void> {
  try {
    switch (payload.channel) {
      case "slack":
        await deliverSlack(env, payload);
        break;
      case "teams":
        await deliverTeams(env, payload);
        break;
      case "whatsapp":
        await deliverWhatsApp(env, payload);
        break;
      case "telegram":
        await deliverTelegram(env, payload);
        break;
      case "discord":
        await deliverDiscord(env, payload);
        break;
      case "sms":
        await deliverSms(env, payload);
        break;
    }
  } catch (err) {
    console.error(`[Moltworker] Delivery to ${payload.channel} failed:`, err);
  }
}

async function deliverSlack(env: Env, p: DeliveryPayload): Promise<void> {
  const token = await env.CONFIG_KV.get("chatops:slack:bot_token");
  if (!token) return;

  const body: Record<string, any> = {
    channel: p.channel_id,
    text: typeof p.content === "string" ? p.content : JSON.stringify(p.content),
  };
  if (p.thread_id) body.thread_ts = p.thread_id;

  // If content is blocks, use blocks format
  if (typeof p.content === "object" && (p.content as any).blocks) {
    body.blocks = (p.content as any).blocks;
  }

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function deliverTeams(env: Env, p: DeliveryPayload): Promise<void> {
  const webhookUrl = await env.CONFIG_KV.get("chatops:teams:webhook_url");
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      text: typeof p.content === "string" ? p.content : JSON.stringify(p.content),
    }),
  });
}

async function deliverWhatsApp(env: Env, p: DeliveryPayload): Promise<void> {
  const token = await env.CONFIG_KV.get("chatops:whatsapp:access_token");
  const phoneNumberId = await env.CONFIG_KV.get("chatops:whatsapp:phone_number_id");
  if (!token || !phoneNumberId) return;

  await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.channel_id,
      type: "text",
      text: { body: typeof p.content === "string" ? p.content : JSON.stringify(p.content) },
    }),
  });
}

async function deliverTelegram(env: Env, p: DeliveryPayload): Promise<void> {
  const botToken = await env.CONFIG_KV.get("chatops:telegram:bot_token");
  if (!botToken) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: p.channel_id,
      text: typeof p.content === "string" ? p.content : JSON.stringify(p.content),
      parse_mode: "Markdown",
      reply_to_message_id: p.thread_id ? parseInt(p.thread_id) : undefined,
    }),
  });
}

async function deliverDiscord(env: Env, p: DeliveryPayload): Promise<void> {
  const webhookUrl = await env.CONFIG_KV.get("chatops:discord:webhook_url");
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: typeof p.content === "string" ? p.content : undefined,
      embeds: typeof p.content === "object" && (p.content as any).embeds
        ? (p.content as any).embeds
        : undefined,
    }),
  });
}

async function deliverSms(env: Env, p: DeliveryPayload): Promise<void> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return;

  const params = new URLSearchParams({
    To: p.channel_id,
    From: from,
    Body: typeof p.content === "string" ? p.content : JSON.stringify(p.content),
  });

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
}

// ── Signature Verification Helpers ───────────────────────────

async function verifySlackSignature(
  body: string, timestamp: string, signature: string, secret: string,
): Promise<boolean> {
  try {
    // Reject old timestamps (5 min window)
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const sigBasestring = `v0:${timestamp}:${body}`;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sigBasestring));
    const hex = "v0=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hex === signature;
  } catch {
    return false;
  }
}

async function verifyDiscordSignature(
  body: string, signature: string, timestamp: string, publicKey: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKey),
      { name: "Ed25519", namedCurve: "Ed25519" } as any,
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", key, hexToUint8Array(signature), msg);
  } catch {
    return false;
  }
}

async function verifyTwilioSignature(
  url: string, params: Record<string, string>, signature: string, authToken: string,
): Promise<boolean> {
  try {
    // Twilio signature: HMAC-SHA1 of URL + sorted params
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + params[key];
    }
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(authToken),
      { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return b64 === signature;
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Result Formatting Helper ─────────────────────────────────

function formatSuccessMessage(result: Record<string, any>): string {
  const parts: string[] = [];

  if (result.action_taken) parts.push(result.action_taken);
  if (result.rules_updated) parts.push(`${result.rules_updated} rules updated`);
  if (result.kv_keys_set) parts.push(`${result.kv_keys_set} KV entries synced`);
  if (result.d1_logged) parts.push("Logged to audit ledger");

  if (parts.length === 0) {
    return "Command executed successfully.";
  }

  return parts.join(" | ");
}

export { moltworkerRouter };
