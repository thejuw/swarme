/**
 * ============================================================
 * Swarme — Phase 64: Enterprise SIEM Export & Audit Webhooks
 * ============================================================
 *
 * "Security & Compliance" tab in the Swarme dashboard.
 *
 * Allows enterprise clients to configure a webhook URL + Bearer
 * token so critical audit events are POSTed in real-time to
 * their own SIEM tools (Datadog, Splunk, AWS CloudWatch, etc.).
 *
 * Routes:
 *   GET    /api/settings/audit/webhook       — Read current config
 *   PUT    /api/settings/audit/webhook       — Create or update config
 *   DELETE /api/settings/audit/webhook       — Remove webhook config
 *   POST   /api/settings/audit/webhook/test  — Send a test event
 *   GET    /api/settings/audit/archives      — List archive manifests
 *
 * All routes require JWT authentication (protectRoute middleware
 * applied in index.ts at the /api/settings/* prefix).
 *
 * The dispatchAuditEvent() function is exported for use across
 * the codebase — any module can fire an audit event that gets
 * forwarded to the client's SIEM.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

// ── Types ───────────────────────────────────────────────────

/** Standardized audit event payload sent to SIEM webhooks */
export interface AuditEvent {
  /** Unique event ID for deduplication */
  event_id: string;
  /** ISO timestamp when the event occurred */
  timestamp: string;
  /** Event category: security, billing, content, system */
  category: "security" | "billing" | "content" | "system";
  /** Machine-readable event type */
  event_type: string;
  /** Human-readable description */
  description: string;
  /** Domain (tenant) where the event occurred */
  domain_id: string;
  /** Actor who triggered the event (user ID or 'system') */
  actor: string;
  /** Additional structured data specific to the event */
  metadata: Record<string, unknown>;
  /** Severity level */
  severity: "critical" | "high" | "medium" | "low" | "info";
}

interface WebhookConfig {
  id: string;
  domain_id: string;
  webhook_url: string;
  bearer_token: string;
  event_types: string;
  is_active: number;
  last_sent_at: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

// ── Audit Event Dispatcher (exported for system-wide use) ───

/**
 * dispatchAuditEvent — Fire-and-forget audit event dispatch.
 *
 * Looks up the domain's webhook config in D1. If a webhook is
 * configured and active, POSTs the event payload. If the webhook
 * fails, increments the failure counter. After 10 consecutive
 * failures, the webhook is auto-disabled.
 *
 * This function is designed to be called with waitUntil() so it
 * never blocks the main request path.
 *
 * Usage in any route handler:
 *   ctx.executionCtx.waitUntil(
 *     dispatchAuditEvent(env, {
 *       event_id: crypto.randomUUID(),
 *       timestamp: new Date().toISOString(),
 *       category: "billing",
 *       event_type: "media_wallet.deducted",
 *       description: "Media Wallet deducted 50 credits for image generation",
 *       domain_id: "dom_abc123",
 *       actor: "user_xyz",
 *       metadata: { amount: 50, reason: "dall-e-3" },
 *       severity: "medium",
 *     })
 *   );
 */
export async function dispatchAuditEvent(
  env: Env,
  event: AuditEvent,
): Promise<void> {
  try {
    // Look up webhook config for this domain
    const config = await env.DB.prepare(
      `SELECT * FROM Webhook_Configs
       WHERE domain_id = ?1 AND is_active = 1
       LIMIT 1`,
    )
      .bind(event.domain_id)
      .first<WebhookConfig>();

    if (!config) return; // No webhook configured — silent no-op

    // Check event type filter
    const allowedTypes: string[] = JSON.parse(config.event_types || '["*"]');
    if (
      !allowedTypes.includes("*") &&
      !allowedTypes.includes(event.event_type) &&
      !allowedTypes.includes(event.category)
    ) {
      return; // Event type not in the subscription filter
    }

    // POST to the client's SIEM endpoint
    const response = await fetch(config.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bearer_token}`,
        "X-Swarme-Event": event.event_type,
        "X-Swarme-Signature": await computeHmac(
          config.bearer_token,
          JSON.stringify(event),
        ),
      },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      // Success — reset failure count and update last_sent_at
      await env.DB.prepare(
        `UPDATE Webhook_Configs
         SET last_sent_at = ?1, failure_count = 0, updated_at = ?1
         WHERE id = ?2`,
      )
        .bind(new Date().toISOString(), config.id)
        .run();
    } else {
      // Failure — increment counter
      const newCount = config.failure_count + 1;
      const disable = newCount >= 10;

      await env.DB.prepare(
        `UPDATE Webhook_Configs
         SET failure_count = ?1, is_active = ?2, updated_at = ?3
         WHERE id = ?4`,
      )
        .bind(
          newCount,
          disable ? 0 : 1,
          new Date().toISOString(),
          config.id,
        )
        .run();

      if (disable) {
        console.error(
          `[AuditWebhook] Webhook for domain ${event.domain_id} disabled after 10 consecutive failures`,
        );
      }
    }
  } catch (err) {
    // Never let a webhook failure crash the main request
    console.error(
      `[AuditWebhook] Dispatch error for domain ${event.domain_id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * HMAC-SHA256 signature for webhook payloads — allows the
 * receiving SIEM to verify the payload wasn't tampered with.
 */
async function computeHmac(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Hono Router ─────────────────────────────────────────────

export const auditRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /webhook — Read the current webhook configuration.
 * Returns the config (with bearer_token masked) or null.
 */
auditRouter.get("/webhook", async (c) => {
  const domainId = c.get("domainId" as never) as string;
  if (!domainId) return c.json({ success: false, error: "Missing domain context" }, 400);

  const config = await c.env.DB.prepare(
    `SELECT * FROM Webhook_Configs WHERE domain_id = ?1 LIMIT 1`,
  )
    .bind(domainId)
    .first<WebhookConfig>();

  if (!config) {
    return c.json({ success: true, webhook: null });
  }

  return c.json({
    success: true,
    webhook: {
      id: config.id,
      webhook_url: config.webhook_url,
      // Mask the bearer token — only show first 8 chars
      bearer_token_preview: config.bearer_token.substring(0, 8) + "••••••••",
      event_types: JSON.parse(config.event_types),
      is_active: config.is_active === 1,
      last_sent_at: config.last_sent_at,
      failure_count: config.failure_count,
      created_at: config.created_at,
      updated_at: config.updated_at,
    },
  });
});

/**
 * PUT /webhook — Create or update the SIEM webhook config.
 * Body: { webhook_url, bearer_token, event_types? }
 */
auditRouter.put("/webhook", async (c) => {
  const domainId = c.get("domainId" as never) as string;
  if (!domainId) return c.json({ success: false, error: "Missing domain context" }, 400);

  const body = await c.req.json<{
    webhook_url?: string;
    bearer_token?: string;
    event_types?: string[];
  }>();

  if (!body.webhook_url || !body.bearer_token) {
    return c.json(
      { success: false, error: "webhook_url and bearer_token are required" },
      400,
    );
  }

  // Validate URL format
  try {
    new URL(body.webhook_url);
  } catch {
    return c.json({ success: false, error: "Invalid webhook_url format" }, 400);
  }

  const eventTypes = JSON.stringify(body.event_types || ["*"]);
  const now = new Date().toISOString();

  // Upsert — check if config already exists for this domain
  const existing = await c.env.DB.prepare(
    `SELECT id FROM Webhook_Configs WHERE domain_id = ?1 LIMIT 1`,
  )
    .bind(domainId)
    .first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE Webhook_Configs
       SET webhook_url = ?1, bearer_token = ?2, event_types = ?3,
           is_active = 1, failure_count = 0, updated_at = ?4
       WHERE id = ?5`,
    )
      .bind(body.webhook_url, body.bearer_token, eventTypes, now, existing.id)
      .run();

    return c.json({ success: true, message: "Webhook configuration updated" });
  }

  // Create new config
  const configId = `whk_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
  await c.env.DB.prepare(
    `INSERT INTO Webhook_Configs (id, domain_id, webhook_url, bearer_token, event_types, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
  )
    .bind(configId, domainId, body.webhook_url, body.bearer_token, eventTypes, now)
    .run();

  return c.json({ success: true, message: "Webhook configuration created", id: configId });
});

/**
 * DELETE /webhook — Remove the SIEM webhook config for this domain.
 */
auditRouter.delete("/webhook", async (c) => {
  const domainId = c.get("domainId" as never) as string;
  if (!domainId) return c.json({ success: false, error: "Missing domain context" }, 400);

  await c.env.DB.prepare(
    `DELETE FROM Webhook_Configs WHERE domain_id = ?1`,
  )
    .bind(domainId)
    .run();

  return c.json({ success: true, message: "Webhook configuration removed" });
});

/**
 * POST /webhook/test — Send a test audit event to verify the
 * webhook integration is working correctly.
 */
auditRouter.post("/webhook/test", async (c) => {
  const domainId = c.get("domainId" as never) as string;
  if (!domainId) return c.json({ success: false, error: "Missing domain context" }, 400);

  const config = await c.env.DB.prepare(
    `SELECT * FROM Webhook_Configs WHERE domain_id = ?1 AND is_active = 1 LIMIT 1`,
  )
    .bind(domainId)
    .first<WebhookConfig>();

  if (!config) {
    return c.json(
      { success: false, error: "No active webhook configured. Save a webhook first." },
      404,
    );
  }

  const testEvent: AuditEvent = {
    event_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    category: "system",
    event_type: "webhook.test",
    description: "Test event from Swarme Security & Compliance module",
    domain_id: domainId,
    actor: "system",
    metadata: { test: true },
    severity: "info",
  };

  try {
    const response = await fetch(config.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.bearer_token}`,
        "X-Swarme-Event": "webhook.test",
        "X-Swarme-Signature": await computeHmac(
          config.bearer_token,
          JSON.stringify(testEvent),
        ),
      },
      body: JSON.stringify(testEvent),
    });

    if (response.ok) {
      return c.json({
        success: true,
        message: "Test event delivered successfully",
        status: response.status,
      });
    }

    return c.json({
      success: false,
      error: `Webhook returned HTTP ${response.status}: ${response.statusText}`,
    }, 502);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ success: false, error: `Webhook delivery failed: ${msg}` }, 502);
  }
});

/**
 * GET /archives — List archive manifests (cold storage records).
 * Supports pagination via ?page=N&limit=N query params.
 */
auditRouter.get("/archives", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  const [manifests, countResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM Archive_Manifests
       ORDER BY archived_at DESC
       LIMIT ?1 OFFSET ?2`,
    )
      .bind(limit, offset)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) as total FROM Archive_Manifests`).first<{
      total: number;
    }>(),
  ]);

  return c.json({
    success: true,
    archives: manifests.results || [],
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
});
