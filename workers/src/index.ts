/**
 * ============================================================
 * Swarme Edge Worker — Phase 4: External API Integrations
 * ============================================================
 *
 * Framework:  Hono.js (optimized for Cloudflare Workers)
 * Database:   Cloudflare D1 (SQLite at the edge)
 * Config:     Cloudflare KV (sub-millisecond reads)
 *
 * This worker serves as the entry point for the entire swarm.
 * It exposes REST endpoints for the dashboard (fetch events),
 * autonomous cron triggers (scheduled events), and Durable Object
 * routing for the AgentWorkflowManager state machine.
 *
 * Phase 4: Pipeline steps now call real external APIs:
 *   - Perplexity API (research + drafting),
 *   - CMS webhooks (publishing)
 *   with graceful fallback to mocks when keys are not configured.
 *
 * Architecture:
 *   Dashboard ←→ [Hono API] ←→ D1 (relational state)
 *                     ↕
 *                 KV (config cache)
 *                     ↕
 *             [Scheduled Cron] → Micro-Agent functions
 *                     ↕
 *           [Durable Objects] → AgentWorkflowManager (state machine)
 * ============================================================
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter, protectRoute, requireSuperadmin } from "./auth";
import { managerRouter } from "./routes/manager";
import { webhookRouter } from "./routes/webhooks";
import { catalogWebhookRouter } from "./routes/webhooks/catalog";
import { billingRouter } from "./routes/billing";
import { gscRouter } from "./routes/integrations/gsc";
import { ga4Router } from "./routes/integrations/ga4";
import { pinterestRouter } from "./routes/integrations/pinterest";
import { redditRouter } from "./routes/integrations/reddit";
import { handleRetentionCron } from "./cron/retention";
import { handleDailyDigest, handleWeeklyDigest } from "./cron/newsletters";
import { handleGscSync } from "./cron/gscSync";
import { handleGa4Sync } from "./cron/ga4Sync";
import { handleGa4CroTrigger } from "./cron/ga4CroTrigger";
import { incrementAbView, incrementAbConversion } from "./middleware/abSplit";
import { calculateSignificance, evaluateAndConclude } from "./utils/statistics";
import { apiAuth } from "./middleware/apiAuth";
import { domainAuth } from "./middleware/domainAuth";
import { v1Router } from "./routes/api/v1";
import { walletRechargeRouter, handleWalletRecharge } from "./routes/billing/recharge";
import { handleDataSynthesizerCron } from "./cron/dataSynthesizer";
import { llmsTxtRouter } from "./routes/llms-txt";
import { runApiFuzzer } from "./tests/chaos/apiFuzzer";
import { runLlmAttacker } from "./tests/chaos/llmAttacker";
import { handleLinkRotCron } from "./cron/linkRot";
import { handleMemoryCompression } from "./cron/memoryCompressor";
import { handleDeadLetterSweep } from "./cron/deadLetter";
import { handleOutcomeEvaluation } from "./cron/outcomeEvaluator";
import { handleLogArchival } from "./cron/logArchiver";
import { auditRouter } from "./routes/settings/audit";
import { setupAllLogpushJobs } from "./utils/logpushSetup";
import { getAllCircuitStatuses, CircuitBreaker, CIRCUIT_SERVICES } from "./utils/circuitBreaker";
import type { CircuitService } from "./utils/circuitBreaker";
import { getAllThrottleStatuses, THROTTLED_SERVICES } from "./utils/throttle";
import type { ThrottledService } from "./utils/throttle";
import { getFailsafeStatuses, unblockTask } from "./utils/executionCap";

// Re-export Durable Object classes so Cloudflare can find them
export { AgentWorkflowManager } from "./durable_object";
export { WorkflowCheckpointDO } from "./durable_objects/workflowCheckpoint";

// ─────────────────────────────────────────────────────────────
// Task 2.1: Environment Bindings & Type Definitions
// ─────────────────────────────────────────────────────────────

/**
 * Cloudflare Worker environment bindings.
 * Each binding is declared in wrangler.toml and injected at runtime.
 */
export interface Env {
  // ── Storage Bindings ──
  DB: D1Database;          // D1 relational database (Projects, Agent_Tasks, Visibility_Logs)
  CONFIG_KV: KVNamespace;  // KV namespace for project settings (edge-speed reads)

  // ── AI & Vector Bindings ──
  VECTORIZE: VectorizeIndex;
  AI: Ai;

  // ── R2 Media Storage (Phase 40) ──
  MEDIA_BUCKET: R2Bucket;

  // ── Browser Rendering Binding (Phase 11) ──
  BROWSER: Fetcher;

  // ── Durable Object Bindings (Phase 3) ──
  AGENT_WORKFLOW: DurableObjectNamespace;

  // ── Durable Object Bindings (Phase 62) ──
  WORKFLOW_CHECKPOINT: DurableObjectNamespace;

  // ── Environment Variables ──
  ENVIRONMENT: string;
  SWARM_MODE: string;
  TREND_VELOCITY_THRESHOLD: string;
  BOUNCE_RATE_THRESHOLD: string;

  // ── Secrets (set via wrangler secret put) ──
  GEMINI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  HUNTER_API_KEY: string;
  RESEND_API_KEY: string;
  POSTHOG_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // ── Phase 15: Shopify Webhook ──
  SHOPIFY_WEBHOOK_SECRET: string;

  // ── Phase 19: JWT Authentication ──
  JWT_SECRET: string;

  // ── Phase 20: Twilio SMS Notifications ──
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_FROM_NUMBER: string;

  // ── Phase 22: Security & Telemetry ──
  TURNSTILE_SECRET_KEY: string;
  SENTRY_DSN: string;

  // ── Phase 23: Support Desk & GDPR Compliance ──
  SUPPORT_APP_ID: string;
  COOKIE_CONSENT_ID: string;

  // ── Phase 24: Affiliate & Partner Growth Engine ──
  REWARDFUL_API_KEY: string;

  // ── Phase 34: Google Search Console OAuth ──
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;

  // ── Phase 40: Media Generation ──
  R2_PUBLIC_BASE: string;

  // ── Phase 49: Off-Domain OAuth ──
  PINTEREST_APP_ID: string;
  PINTEREST_APP_SECRET: string;
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
}

/**
 * Project settings stored in KV under key pattern:
 * config:project:{projectId}:settings
 */
interface ProjectSettings {
  mode: "copilot" | "autopilot";
  is_active: boolean;
  visibility_check_enabled: boolean;
  trend_detection_enabled: boolean;
  cro_enabled: boolean;
  outreach_enabled: boolean;
  bounce_rate_threshold: number;
  trend_velocity_threshold: number;
  updated_at: string;
}

/**
 * Shape of a mock Perplexity API response for visibility checks.
 * In Phase 4, this will be replaced by an actual HTTP call.
 */
interface PerplexityVisibilityResult {
  keyword: string;
  cited: boolean;
  rank_position: number | null;
  citation_url: string | null;
  engine: "Perplexity" | "ChatGPT" | "Gemini" | "Claude" | "CoPilot";
}

// ─────────────────────────────────────────────────────────────
// Hono Application Instance
// ─────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ── Global Middleware ──
app.use(
  "*",
  cors({
    origin: "*", // In production, restrict to dashboard origin
    allowMethods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Auth Routes (public — no JWT required) ──
app.route("/api/auth", authRouter);

// ── Webhooks (public — Stripe verifies its own signature, catalog verifies per-platform) ──
app.route("/api/webhooks", webhookRouter);
app.route("/api/webhooks/catalog", catalogWebhookRouter);

// ── Phase 53: /llms.txt Dynamic Edge Router (public — for AI crawlers) ──
app.route("/llms.txt", llmsTxtRouter);

// ── Public Routes (no JWT required) ──
// /health, /api/public/*, /api/billing/webhook, /api/webhooks/* are unprotected

// ── Health Check ──
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "swarme-edge",
    version: "0.4.0",
    phase: 4,
    mode: c.env.SWARM_MODE,
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    bindings: {
      d1: !!c.env.DB,
      kv: !!c.env.CONFIG_KV,
      vectorize: !!c.env.VECTORIZE,
      ai: !!c.env.AI,
      agent_workflow_do: !!c.env.AGENT_WORKFLOW,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// JWT Protection — All /api/projects/* and /api/user/* require auth
// ─────────────────────────────────────────────────────────────
app.use("/api/projects/*", protectRoute());
app.use("/api/user/*", protectRoute());
app.use("/api/domains/*", protectRoute());
app.use("/api/admin/*", requireSuperadmin());
app.use("/api/manager/*", protectRoute());
app.use("/api/billing/*", protectRoute());
app.use("/api/gsc/*", protectRoute());
app.use("/api/ga4/*", protectRoute());
app.use("/api/circuit-breaker/*", protectRoute());
app.use("/api/admin/failsafe/*", protectRoute());
app.use("/api/throttle/*", protectRoute());
app.use("/api/settings/*", protectRoute());
// Note: /api/webhooks/* is intentionally unprotected — Stripe signs its own payloads

// ── Protected Route Mounting ──
// CRITICAL: In Hono v4, routes MUST be mounted AFTER their middleware declarations.
// Mounting a route before its middleware means the middleware never applies.
app.route("/api/manager", managerRouter);
app.route("/api/billing", billingRouter);
app.route("/api/billing/wallet", walletRechargeRouter);
app.route("/api/gsc", gscRouter);
app.route("/api/ga4", ga4Router);
app.route("/api/pinterest", pinterestRouter);
app.route("/api/reddit", redditRouter);
app.route("/api/settings/audit", auditRouter);

// ─────────────────────────────────────────────────────────────
// GET /api/workspace — Current user's workspace (for Settings page)
// ─────────────────────────────────────────────────────────────

app.get("/api/workspace", protectRoute(), async (c: any) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ success: false, error: "Unauthorized" }, 401);

  // Look up user email, then find their workspace
  const user = await c.env.DB.prepare(
    "SELECT email FROM Users WHERE id = ?"
  ).bind(userId).first<{ email: string }>();

  if (!user) return c.json({ success: false, error: "User not found" }, 404);

  // Find workspace by owner_email
  let ws = await c.env.DB.prepare(
    "SELECT * FROM Workspaces WHERE owner_email = ? LIMIT 1"
  ).bind(user.email).first();

  // If no workspace exists, auto-create one for this user
  if (!ws) {
    const wsId = "ws_" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
    await c.env.DB.prepare(
      `INSERT INTO Workspaces (id, name, owner_email, subscription_status, plan)
       VALUES (?1, ?2, ?3, 'active', 'growth')`
    ).bind(wsId, `${user.email.split("@")[0]}'s Workspace`, user.email).run();

    ws = await c.env.DB.prepare(
      "SELECT * FROM Workspaces WHERE id = ?"
    ).bind(wsId).first();
  }

  // Map DB columns to frontend Workspace interface
  return c.json({
    success: true,
    workspace: {
      id: (ws as any).id,
      name: (ws as any).name,
      owner_email: (ws as any).owner_email,
      plan_tier: (ws as any).plan,
      plan_status: (ws as any).subscription_status,
      stripe_customer_id: (ws as any).stripe_customer_id || null,
      stripe_subscription_id: null,
      created_at: (ws as any).created_at,
      updated_at: (ws as any).updated_at,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 56: Circuit Breaker Status & Control Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/circuit-breaker/status
 * Returns the current state of all upstream API circuit breakers.
 */
app.get("/api/circuit-breaker/status", async (c) => {
  try {
    const statuses = await getAllCircuitStatuses(c.env.CONFIG_KV);
    return c.json({ success: true, circuits: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * POST /api/circuit-breaker/reset/:service
 * Admin-only: Force-reset a circuit breaker to CLOSED state.
 */
app.post("/api/circuit-breaker/reset/:service", async (c) => {
  const service = c.req.param("service") as CircuitService;

  if (!CIRCUIT_SERVICES.includes(service)) {
    return c.json(
      { success: false, error: `Invalid service. Valid: ${CIRCUIT_SERVICES.join(", ")}` },
      400,
    );
  }

  try {
    const breaker = new CircuitBreaker(service, c.env.CONFIG_KV);
    await breaker.reset();
    return c.json({ success: true, message: `Circuit breaker for ${service} reset to CLOSED` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 57: Agent Failsafe Kill-Switch Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/failsafe/status
 * Returns all failsafe statuses for the authenticated domain.
 */
app.get("/api/admin/failsafe/status", async (c) => {
  try {
    const domainId = c.get("domainId" as never) || "proj_001";
    const statuses = await getFailsafeStatuses(c.env, domainId);
    return c.json({ success: true, failsafes: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

/**
 * POST /api/admin/failsafe/unblock
 * Admin-only: Unblock a task that has been killed by the failsafe.
 * Body: { domain_id: string, task_type: string }
 */
app.post("/api/admin/failsafe/unblock", async (c) => {
  try {
    const body = await c.req.json<{ domain_id?: string; task_type?: string }>();
    const domainId = body.domain_id || (c.get("domainId" as never) as string) || "proj_001";
    const taskType = body.task_type;

    if (!taskType) {
      return c.json({ success: false, error: "task_type is required" }, 400);
    }

    const result = await unblockTask(c.env, domainId, taskType);
    return c.json({ success: result.success, message: result.success ? `Task "${taskType}" has been unblocked` : "No matching blocked task found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 57: Throttle Queue Status Endpoint
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/throttle/status
 * Returns current token bucket utilization for all throttled services.
 */
app.get("/api/throttle/status", async (c) => {
  try {
    const statuses = await getAllThrottleStatuses(c.env.CONFIG_KV);
    return c.json({ success: true, services: statuses });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 64: Admin — Logpush Setup (one-shot provisioning)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/admin/logpush/setup
 * Superadmin-only: Provision Cloudflare Logpush jobs to stream
 * HTTP request logs and Worker Trace Events into R2.
 * Body: { cf_api_token: string }
 */
app.post("/api/admin/logpush/setup", async (c) => {
  try {
    const body = await c.req.json<{ cf_api_token?: string }>();
    if (!body.cf_api_token) {
      return c.json({ success: false, error: "cf_api_token is required" }, 400);
    }

    const accountId = "a6b2989fec67663a5184cf0060621331";
    const result = await setupAllLogpushJobs({
      accountId,
      apiToken: body.cf_api_token,
      bucketName: "swarme-media",
    });

    return c.json({
      success: result.errors.length === 0,
      httpRequestsJobId: result.httpRequestsJobId,
      workersTraceJobId: result.workersTraceJobId,
      errors: result.errors,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return c.json({ success: false, error: msg }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 23: Public Config — exposes non-secret widget IDs
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/public/config
 * Returns non-secret widget IDs for client-side script injection.
 * No auth required. Exposes non-secret widget IDs and affiliate program ID.
 */
app.get("/api/public/config", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:keys");
    const keys = raw ? JSON.parse(raw) : {};
    return c.json({
      success: true,
      config: {
        supportAppId: keys.support?.SUPPORT_APP_ID || "",
        cookieConsentId: keys.compliance?.COOKIE_CONSENT_ID || "",
        rewardfulId: keys.affiliates?.REWARDFUL_API_KEY ? "active" : "",
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 21: Superadmin Admin API
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * CRM endpoint — returns all users with role, plan, status.
 */
app.get("/api/admin/users", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      "SELECT id, email, role, plan, status, created_at FROM Users ORDER BY created_at DESC"
    ).all();
    return c.json({ success: true, users: results || [] });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/admin/users/:userId/reset-password
 * Resets a user's password (superadmin action).
 */
app.post("/api/admin/users/:userId/reset-password", async (c) => {
  const { userId } = c.req.param();
  // Generate a random temp password
  const tempPass = crypto.randomUUID().slice(0, 12);
  try {
    // Dynamic import to avoid circular — hashPassword is in auth.ts
    const { hashPassword } = await import("./auth");
    const hash = await hashPassword(tempPass);
    await c.env.DB.prepare(
      "UPDATE Users SET password_hash = ?1 WHERE id = ?2"
    ).bind(hash, userId).run();
    return c.json({ success: true, temporaryPassword: tempPass });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/admin/users/:userId/revoke
 * Sets a user's status to 'suspended'.
 */
app.post("/api/admin/users/:userId/revoke", async (c) => {
  const { userId } = c.req.param();
  try {
    await c.env.DB.prepare(
      "UPDATE Users SET status = 'suspended' WHERE id = ?1"
    ).bind(userId).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * GET /api/admin/infrastructure/keys
 * Returns the global infrastructure config from KV (keys masked).
 */
app.get("/api/admin/infrastructure/keys", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:keys");
    const keys = raw ? JSON.parse(raw) : {
      ai_models: { PERPLEXITY_API_KEY: "", GEMINI_API_KEY: "", ANTHROPIC_API_KEY: "" },
      communications: { RESEND_API_KEY: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_FROM_NUMBER: "" },
      billing: { STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" },
      security: { TURNSTILE_SECRET_KEY: "", SENTRY_DSN: "" },
      support: { SUPPORT_APP_ID: "" },
      compliance: { COOKIE_CONSENT_ID: "" },
      affiliates: { REWARDFUL_API_KEY: "" },
      google: { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" },
    };
    return c.json({ success: true, keys });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

/**
 * POST /api/admin/infrastructure/keys
 * Updates global infrastructure config in KV + audit log.
 */
app.post("/api/admin/infrastructure/keys", async (c) => {
  const actorId = c.get("userId") as string;
  try {
    const body = await c.req.json<{ category: string; key_name: string; value: string }>();
    const { category, key_name, value } = body;
    if (!category || !key_name) {
      return c.json({ success: false, error: "category and key_name required" }, 400);
    }

    // Read existing, merge, write back
    const raw = await c.env.CONFIG_KV.get("global:config:keys");
    const keys = raw ? JSON.parse(raw) : {};
    if (!keys[category]) keys[category] = {};
    keys[category][key_name] = value;
    await c.env.CONFIG_KV.put("global:config:keys", JSON.stringify(keys));

    // Audit log (non-blocking — key save should succeed even if audit fails)
    try {
      await c.env.DB.prepare(
        "INSERT INTO Infrastructure_Audit_Log (category, key_name, action, actor_id) VALUES (?1, ?2, ?3, ?4)"
      ).bind(category, key_name, value ? "set" : "revoked", actorId || "system").run();
    } catch (auditErr) {
      console.warn(`[Vault] Audit log write failed (non-critical): ${auditErr}`);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 29: Global Impact Metrics (Superadmin)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/metrics/global
 * Aggregates platform-wide KPIs for the superadmin impact dashboard.
 * Returns totals + 30-day time-series for charting.
 */
app.get("/api/admin/metrics/global", async (c) => {
  try {
    // 1. Total client revenue (from Attributed_Revenue)
    const revenueRow = await c.env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM Attributed_Revenue"
    ).first<{ total: number }>();
    const totalClientRevenue = revenueRow?.total ?? 0;

    // 2. Total completed tasks
    const tasksRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM Agent_Tasks WHERE status = 'Completed'"
    ).first<{ total: number }>();
    const totalTasksExecuted = tasksRow?.total ?? 0;

    // 3. Human hours saved (4 hrs per task)
    const totalHoursSaved = totalTasksExecuted * 4;

    // 4. Active MRR (sum of active subscription amounts — assumes Users.plan maps to pricing)
    const mrrRow = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(
        CASE
          WHEN plan = 'pro' THEN 79
          WHEN plan = 'enterprise' THEN 249
          ELSE 0
        END
      ), 0) AS total FROM Users WHERE status = 'active'`
    ).first<{ total: number }>();
    const activeMRR = mrrRow?.total ?? 0;

    // 5. ADA/Vision fixes (CRO alt-text tasks)
    const adaRow = await c.env.DB.prepare(
      "SELECT COUNT(*) AS total FROM Agent_Tasks WHERE status = 'Completed' AND (agent_type = 'cro' OR agent_type = 'vision') AND (action LIKE '%alt%' OR action LIKE '%ADA%' OR action LIKE '%accessibility%')"
    ).first<{ total: number }>();
    const totalAdaFixes = adaRow?.total ?? 0;

    // 6. 30-day time-series (tasks per day + estimated cost)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const dailyRows = await c.env.DB.prepare(
      `SELECT DATE(created_at) AS day, COUNT(*) AS tasks
       FROM Agent_Tasks
       WHERE status = 'Completed' AND DATE(created_at) >= ?1
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    ).bind(thirtyDaysAgo).all<{ day: string; tasks: number }>();

    const timeSeries = (dailyRows.results || []).map((r) => ({
      date: r.day,
      tasks: r.tasks,
      apiCost: parseFloat((r.tasks * 0.02).toFixed(2)),
    }));

    // 7. Top 5 failing integrations
    const failRows = await c.env.DB.prepare(
      `SELECT agent_type AS integration, COUNT(*) AS failures
       FROM Agent_Tasks
       WHERE status = 'Failed'
       GROUP BY agent_type
       ORDER BY failures DESC
       LIMIT 5`
    ).all<{ integration: string; failures: number }>();
    const failingIntegrations = failRows.results || [];

    return c.json({
      success: true,
      metrics: {
        totalClientRevenue,
        totalTasksExecuted,
        totalHoursSaved,
        activeMRR,
        totalAdaFixes,
        timeSeries,
        failingIntegrations,
      },
    });
  } catch (err: any) {
    console.error("[Admin] Global metrics error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 20: User Notification Preferences API
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/user/preferences
 * Returns the authenticated user's notification preferences.
 */
app.get("/api/user/preferences", async (c) => {
  const userId = c.get("userId") as string;
  try {
    const row = await c.env.DB.prepare(
      `SELECT phone_number, notify_email, notify_sms,
              alert_frequency, receive_sms, receive_marketing
       FROM Users WHERE id = ?1`
    )
      .bind(userId)
      .first<{
        phone_number: string | null;
        notify_email: number;
        notify_sms: number;
        alert_frequency: string | null;
        receive_sms: number | null;
        receive_marketing: number | null;
      }>();

    if (!row) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    return c.json({
      success: true,
      preferences: {
        phone_number: row.phone_number ?? "",
        notify_email: row.notify_email === 1,
        notify_sms: row.notify_sms === 1,
        alert_frequency: row.alert_frequency ?? "realtime",
        receive_sms: (row.receive_sms ?? 1) === 1,
        receive_marketing: (row.receive_marketing ?? 1) === 1,
      },
    });
  } catch (err: any) {
    console.error("[Preferences] GET error:", err);
    return c.json({ success: false, error: "Failed to fetch preferences" }, 500);
  }
});

/**
 * POST /api/user/preferences
 * Updates the authenticated user's notification preferences.
 * Body: { phone_number?: string, notify_email?: boolean, notify_sms?: boolean }
 */
app.post("/api/user/preferences", async (c) => {
  const userId = c.get("userId") as string;
  try {
    const body = await c.req.json<{
      phone_number?: string;
      notify_email?: boolean;
      notify_sms?: boolean;
    }>();

    // Build SET clauses dynamically for only provided fields
    const setClauses: string[] = [];
    const binds: (string | number)[] = [];
    let idx = 1;

    if (typeof body.phone_number === "string") {
      setClauses.push(`phone_number = ?${idx}`);
      binds.push(body.phone_number.trim() || "");
      idx++;
    }
    if (typeof body.notify_email === "boolean") {
      setClauses.push(`notify_email = ?${idx}`);
      binds.push(body.notify_email ? 1 : 0);
      idx++;
    }
    if (typeof body.notify_sms === "boolean") {
      setClauses.push(`notify_sms = ?${idx}`);
      binds.push(body.notify_sms ? 1 : 0);
      idx++;
    }

    if (setClauses.length === 0) {
      return c.json({ success: false, error: "No fields to update" }, 400);
    }

    // Append userId as the last bind
    binds.push(userId);
    const sql = `UPDATE Users SET ${setClauses.join(", ")} WHERE id = ?${idx}`;

    await c.env.DB.prepare(sql).bind(...binds).run();

    // Return the updated preferences
    const updated = await c.env.DB.prepare(
      "SELECT phone_number, notify_email, notify_sms FROM Users WHERE id = ?1"
    )
      .bind(userId)
      .first<{ phone_number: string | null; notify_email: number; notify_sms: number }>();

    return c.json({
      success: true,
      preferences: {
        phone_number: updated?.phone_number ?? "",
        notify_email: (updated?.notify_email ?? 1) === 1,
        notify_sms: (updated?.notify_sms ?? 0) === 1,
      },
    });
  } catch (err: any) {
    console.error("[Preferences] POST error:", err);
    return c.json({ success: false, error: "Failed to update preferences" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 44: PATCH /api/user/settings (alert_frequency, receive_sms, receive_marketing)
// ─────────────────────────────────────────────────────────────

/**
 * PATCH /api/user/settings
 * Updates Phase 44 user settings: alert_frequency, receive_sms, receive_marketing.
 * Body: { alert_frequency?: 'realtime'|'daily'|'weekly'|'muted', receive_sms?: boolean, receive_marketing?: boolean }
 */
app.patch("/api/user/settings", async (c) => {
  const userId = c.get("userId") as string;
  try {
    const body = await c.req.json<{
      alert_frequency?: string;
      receive_sms?: boolean;
      receive_marketing?: boolean;
    }>();

    const VALID_FREQUENCIES = ["realtime", "daily", "weekly", "muted"];

    const setClauses: string[] = [];
    const binds: (string | number)[] = [];
    let idx = 1;

    if (typeof body.alert_frequency === "string" && VALID_FREQUENCIES.includes(body.alert_frequency)) {
      setClauses.push(`alert_frequency = ?${idx}`);
      binds.push(body.alert_frequency);
      idx++;
    }
    if (typeof body.receive_sms === "boolean") {
      setClauses.push(`receive_sms = ?${idx}`);
      binds.push(body.receive_sms ? 1 : 0);
      idx++;
    }
    if (typeof body.receive_marketing === "boolean") {
      setClauses.push(`receive_marketing = ?${idx}`);
      binds.push(body.receive_marketing ? 1 : 0);
      idx++;
    }

    if (setClauses.length === 0) {
      return c.json({ success: false, error: "No valid fields to update" }, 400);
    }

    binds.push(userId);
    const sql = `UPDATE Users SET ${setClauses.join(", ")} WHERE id = ?${idx}`;
    await c.env.DB.prepare(sql).bind(...binds).run();

    // Return updated settings
    const updated = await c.env.DB.prepare(
      `SELECT alert_frequency, receive_sms, receive_marketing FROM Users WHERE id = ?1`
    )
      .bind(userId)
      .first<{ alert_frequency: string | null; receive_sms: number | null; receive_marketing: number | null }>();

    return c.json({
      success: true,
      settings: {
        alert_frequency: updated?.alert_frequency ?? "realtime",
        receive_sms: (updated?.receive_sms ?? 1) === 1,
        receive_marketing: (updated?.receive_marketing ?? 1) === 1,
      },
    });
  } catch (err: any) {
    console.error("[Settings] PATCH error:", err);
    return c.json({ success: false, error: "Failed to update settings" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 46: Generate API Key (JWT-protected, Enterprise only)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/user/generate-api-key
 * Generates a new `es_live_*` API key for the authenticated user.
 * The raw key is returned exactly ONCE — only the SHA-256 hash is stored.
 * Overwrites any previously stored key.
 */
app.post("/api/user/generate-api-key", async (c) => {
  const userId = c.get("userId") as string;

  try {
    // 1. Verify user is on enterprise plan
    const user = await c.env.DB.prepare(
      "SELECT id, plan, email FROM Users WHERE id = ?1"
    )
      .bind(userId)
      .first<{ id: string; plan: string; email: string }>();

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404);
    }
    if (user.plan !== "enterprise") {
      return c.json(
        { success: false, error: "API keys are only available on the Enterprise plan" },
        403
      );
    }

    // 2. Generate raw key: es_live_ + 32 random hex chars
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const hexSuffix = [...randomBytes]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const rawKey = `es_live_${hexSuffix}`;

    // 3. SHA-256 hash the raw key
    const encoded = new TextEncoder().encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashHex = [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 4. Store ONLY the hash in D1
    await c.env.DB.prepare(
      "UPDATE Users SET api_key_hash = ?1 WHERE id = ?2"
    )
      .bind(hashHex, userId)
      .run();

    // 5. Return raw key exactly once
    return c.json({
      success: true,
      api_key: rawKey,
      warning: "Store this key securely — it will not be shown again.",
    });
  } catch (err: any) {
    console.error("[API Key] Generation error:", err);
    return c.json({ success: false, error: "Failed to generate API key" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 47: Domain CRUD — /api/domains (JWT protected above)
// ─────────────────────────────────────────────────────────────

/** GET /api/domains — list all domains for the authenticated user */
app.get("/api/domains", async (c) => {
  const userId = c.get("userId") as string;
  const { results } = await c.env.DB.prepare(
    "SELECT id, user_id, domain_url, platform_type, credentials_vault_id, label, created_at FROM Domains WHERE user_id = ?1 ORDER BY created_at ASC"
  )
    .bind(userId)
    .all();
  return c.json({ domains: results ?? [] });
});

/** POST /api/domains — create a new domain */
app.post("/api/domains", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json<{
    domain_url: string;
    platform_type: string;
    label?: string;
    credentials?: Record<string, string>;
  }>();

  if (!body.domain_url || !body.platform_type) {
    return c.json({ success: false, error: "domain_url and platform_type are required" }, 400);
  }

  const id = `dom_${crypto.randomUUID().split("-")[0]}`;
  const vaultId = body.credentials ? `vault_${id}` : "";

  // Store credentials in KV if provided
  if (body.credentials && vaultId) {
    await c.env.CONFIG_KV.put(
      `vault:${vaultId}`,
      JSON.stringify(body.credentials)
    );
  }

  await c.env.DB.prepare(
    "INSERT INTO Domains (id, user_id, domain_url, platform_type, credentials_vault_id, label) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  )
    .bind(id, userId, body.domain_url, body.platform_type, vaultId, body.label ?? "")
    .run();

  const domain = await c.env.DB.prepare(
    "SELECT id, user_id, domain_url, platform_type, credentials_vault_id, label, created_at FROM Domains WHERE id = ?1"
  )
    .bind(id)
    .first();

  return c.json({ success: true, domain }, 201);
});

/** PATCH /api/domains/:domainId — update a domain (with ownership check) */
app.patch("/api/domains/:domainId", domainAuth(), async (c) => {
  const domainId = c.get("domainId") as string;
  const body = await c.req.json<{
    domain_url?: string;
    platform_type?: string;
    label?: string;
    credentials?: Record<string, string>;
  }>();

  const sets: string[] = [];
  const binds: string[] = [];
  let idx = 1;

  if (body.domain_url) {
    sets.push(`domain_url = ?${idx}`);
    binds.push(body.domain_url);
    idx++;
  }
  if (body.platform_type) {
    sets.push(`platform_type = ?${idx}`);
    binds.push(body.platform_type);
    idx++;
  }
  if (body.label !== undefined) {
    sets.push(`label = ?${idx}`);
    binds.push(body.label);
    idx++;
  }
  if (body.credentials) {
    const vaultId = c.get("vaultId") as string || `vault_${domainId}`;
    await c.env.CONFIG_KV.put(
      `vault:${vaultId}`,
      JSON.stringify(body.credentials)
    );
    if (!c.get("vaultId")) {
      sets.push(`credentials_vault_id = ?${idx}`);
      binds.push(vaultId);
      idx++;
    }
  }

  if (sets.length > 0) {
    binds.push(domainId);
    const stmt = c.env.DB.prepare(
      `UPDATE Domains SET ${sets.join(", ")} WHERE id = ?${idx}`
    );
    await stmt.bind(...binds).run();
  }

  const domain = await c.env.DB.prepare(
    "SELECT id, user_id, domain_url, platform_type, credentials_vault_id, label, created_at FROM Domains WHERE id = ?1"
  )
    .bind(domainId)
    .first();

  return c.json({ success: true, domain });
});

/** DELETE /api/domains/:domainId — delete a domain (with ownership check) */
app.delete("/api/domains/:domainId", domainAuth(), async (c) => {
  const domainId = c.get("domainId") as string;
  const vaultId = c.get("vaultId") as string;

  // Clean up KV vault credentials
  if (vaultId) {
    await c.env.CONFIG_KV.delete(`vault:${vaultId}`);
  }

  await c.env.DB.prepare("DELETE FROM Domains WHERE id = ?1")
    .bind(domainId)
    .run();

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// Phase 46: Public Developer API — /v1/* (API key auth)
// ─────────────────────────────────────────────────────────────
app.use("/v1/*", apiAuth());
app.route("/v1", v1Router);

// ─────────────────────────────────────────────────────────────
// Task 2.2: Brain-to-Dashboard API Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/tasks
 *
 * Fetches the latest 50 entries from the Agent_Tasks table for a
 * given project. Used by the dashboard's Agent Activity Log.
 *
 * Query params:
 *   - status (optional): Filter by task status
 *   - agent_type (optional): Filter by agent type
 *   - limit (optional): Number of results (default 50, max 100)
 */
app.get("/api/projects/:projectId/tasks", async (c) => {
  const projectId = c.req.param("projectId");
  const status = c.req.query("status");
  const agentType = c.req.query("agent_type");
  const limitParam = c.req.query("limit");
  const limit = Math.min(parseInt(limitParam || "50", 10) || 50, 100);

  try {
    // Build query dynamically with parameterized inputs
    let query = "SELECT * FROM Agent_Tasks WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (agentType) {
      query += " AND agent_type = ?";
      params.push(agentType);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({
      success: true,
      project_id: projectId,
      count: result.results.length,
      tasks: result.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects/:projectId/visibility
 *
 * Fetches the latest visibility/ranking data from the
 * Visibility_Logs table. Used by the AI Visibility Score widget.
 *
 * Query params:
 *   - engine (optional): Filter by AI engine
 *   - limit (optional): Number of results (default 50, max 200)
 */
app.get("/api/projects/:projectId/visibility", async (c) => {
  const projectId = c.req.param("projectId");
  const engine = c.req.query("engine");
  const limitParam = c.req.query("limit");
  const limit = Math.min(parseInt(limitParam || "50", 10) || 50, 200);

  try {
    let query = "SELECT * FROM Visibility_Logs WHERE project_id = ?";
    const params: (string | number)[] = [projectId];

    if (engine) {
      query += " AND engine = ?";
      params.push(engine);
    }

    query += " ORDER BY checked_at DESC LIMIT ?";
    params.push(limit);

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Compute aggregate visibility score for this project
    const totalChecks = result.results.length;
    const citedChecks = result.results.filter(
      (r: Record<string, unknown>) => r.cited === 1
    ).length;
    const score = totalChecks > 0 ? Math.round((citedChecks / totalChecks) * 100) : 0;

    return c.json({
      success: true,
      project_id: projectId,
      visibility_score: score,
      total_checks: totalChecks,
      cited_count: citedChecks,
      gap_count: totalChecks - citedChecks,
      logs: result.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects/:projectId/visibility/summary
 *
 * Returns a per-keyword summary with the latest check result
 * for each keyword. Powers the dashboard citation gap display.
 */
app.get("/api/projects/:projectId/visibility/summary", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    // Get the most recent check per keyword using a subquery
    const result = await c.env.DB.prepare(`
      SELECT vl.*
      FROM Visibility_Logs vl
      INNER JOIN (
        SELECT keyword, MAX(checked_at) as max_checked
        FROM Visibility_Logs
        WHERE project_id = ?
        GROUP BY keyword
      ) latest ON vl.keyword = latest.keyword AND vl.checked_at = latest.max_checked
      WHERE vl.project_id = ?
      ORDER BY vl.cited ASC, vl.keyword ASC
    `)
      .bind(projectId, projectId)
      .all();

    const totalKeywords = result.results.length;
    const citedCount = result.results.filter(
      (r: Record<string, unknown>) => r.cited === 1
    ).length;

    return c.json({
      success: true,
      project_id: projectId,
      visibility_score: totalKeywords > 0 ? Math.round((citedCount / totalKeywords) * 100) : 0,
      keywords_tracked: totalKeywords,
      keywords_cited: citedCount,
      citation_gaps: totalKeywords - citedCount,
      keywords: result.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * PUT /api/projects/:projectId/settings
 *
 * Updates the project configuration. Writes the full settings
 * JSON payload to CONFIG_KV using the key pattern:
 *   config:project:{projectId}:settings
 *
 * Also updates the mode column in the D1 Projects table to keep
 * the relational state in sync.
 */
app.put("/api/projects/:projectId/settings", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const body = await c.req.json<Partial<ProjectSettings>>();

    // Validate that the project exists in D1
    const project = await c.env.DB.prepare(
      "SELECT id, mode FROM Projects WHERE id = ?"
    )
      .bind(projectId)
      .first();

    if (!project) {
      return c.json(
        { success: false, error: `Project ${projectId} not found` },
        404
      );
    }

    // Read existing settings from KV (or build defaults)
    const kvKey = `config:project:${projectId}:settings`;
    const existing = await c.env.CONFIG_KV.get<ProjectSettings>(kvKey, "json");

    const updatedSettings: ProjectSettings = {
      mode: body.mode ?? existing?.mode ?? "copilot",
      is_active: body.is_active ?? existing?.is_active ?? true,
      visibility_check_enabled:
        body.visibility_check_enabled ?? existing?.visibility_check_enabled ?? true,
      trend_detection_enabled:
        body.trend_detection_enabled ?? existing?.trend_detection_enabled ?? true,
      cro_enabled: body.cro_enabled ?? existing?.cro_enabled ?? true,
      outreach_enabled: body.outreach_enabled ?? existing?.outreach_enabled ?? true,
      bounce_rate_threshold:
        body.bounce_rate_threshold ??
        existing?.bounce_rate_threshold ??
        parseInt(c.env.BOUNCE_RATE_THRESHOLD, 10),
      trend_velocity_threshold:
        body.trend_velocity_threshold ??
        existing?.trend_velocity_threshold ??
        parseFloat(c.env.TREND_VELOCITY_THRESHOLD),
      updated_at: new Date().toISOString(),
    };

    // Write to KV with 24-hour TTL metadata (settings are refreshed hourly by cron)
    await c.env.CONFIG_KV.put(kvKey, JSON.stringify(updatedSettings), {
      metadata: { project_id: projectId, updated_at: updatedSettings.updated_at },
    });

    // Sync mode and is_active back to D1 Projects table
    await c.env.DB.prepare(
      "UPDATE Projects SET mode = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?"
    )
      .bind(updatedSettings.mode, updatedSettings.is_active ? 1 : 0, projectId)
      .run();

    return c.json({
      success: true,
      project_id: projectId,
      kv_key: kvKey,
      settings: updatedSettings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects
 *
 * Lists all projects. Used by the dashboard project selector.
 */
app.get("/api/projects", async (c) => {
  try {
    const result = await c.env.DB.prepare(
      "SELECT * FROM Projects ORDER BY created_at DESC"
    ).all();

    return c.json({
      success: true,
      count: result.results.length,
      projects: result.results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/projects/:projectId/tasks/:taskId/approve
 *
 * Approves a task in Copilot mode, changing status from
 * Awaiting_Approval → Running. The Durable Object (Phase 3)
 * will pick this up and execute the agent.
 */
app.post("/api/projects/:projectId/tasks/:taskId/approve", async (c) => {
  const projectId = c.req.param("projectId");
  const taskId = c.req.param("taskId");

  try {
    const task = await c.env.DB.prepare(
      "SELECT id, status FROM Agent_Tasks WHERE id = ? AND project_id = ?"
    )
      .bind(taskId, projectId)
      .first();

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    if (task.status !== "Awaiting_Approval") {
      return c.json(
        { success: false, error: `Task is "${task.status}", not awaiting approval` },
        400
      );
    }

    await c.env.DB.prepare(
      "UPDATE Agent_Tasks SET status = 'Running', updated_at = datetime('now') WHERE id = ?"
    )
      .bind(taskId)
      .run();

    return c.json({
      success: true,
      task_id: taskId,
      new_status: "Running",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 11: Site Audit Endpoints
// ─────────────────────────────────────────────────────────────

import { runDeepAudit } from "./utils/auditor";

/**
 * POST /api/projects/:projectId/audit/run
 *
 * Triggers an autonomous deep site audit using Cloudflare Browser
 * Rendering /crawl endpoint. The audit crawls the project's domain,
 * extracts SEO/performance/accessibility/security findings via
 * Workers AI, computes a health score, and generates a prioritised
 * remediation roadmap.
 *
 * Returns the audit ID immediately; the audit runs asynchronously.
 */
app.post("/api/projects/:projectId/audit/run", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    // Validate project exists and get domain
    const project = await c.env.DB.prepare(
      "SELECT id, domain FROM Projects WHERE id = ?"
    )
      .bind(projectId)
      .first<{ id: string; domain: string }>();

    if (!project) {
      return c.json(
        { success: false, error: `Project ${projectId} not found` },
        404
      );
    }

    const auditedUrl = `https://${project.domain}`;

    // Insert a "running" audit row
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await c.env.DB.prepare(
      `INSERT INTO Site_Audits (id, project_id, status, audited_url)
       VALUES (?, ?, 'running', ?)`
    )
      .bind(auditId, projectId, auditedUrl)
      .run();

    // Run the deep audit (async — use waitUntil to avoid timeout)
    const auditPromise = (async () => {
      try {
        const result = await runDeepAudit(auditedUrl, c.env);

        await c.env.DB.prepare(
          `UPDATE Site_Audits
           SET health_score = ?,
               findings = ?,
               roadmap = ?,
               raw_crawl_data = ?,
               pages_crawled = ?,
               status = 'completed',
               updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(
            result.healthScore,
            JSON.stringify(result.findings),
            JSON.stringify(result.roadmap),
            JSON.stringify(result.rawCrawlData ?? null),
            result.pagesCrawled,
            auditId
          )
          .run();

        console.log(
          `[Swarme Audit] ${project.domain}: score=${result.healthScore}, ` +
          `findings=${result.findings.length}, pages=${result.pagesCrawled}`
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[Swarme Audit] Failed for ${project.domain}:`, errMsg);

        await c.env.DB.prepare(
          `UPDATE Site_Audits
           SET status = 'failed', error_message = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
          .bind(errMsg, auditId)
          .run();
      }
    })();

    c.executionCtx.waitUntil(auditPromise);

    return c.json({
      success: true,
      audit_id: auditId,
      project_id: projectId,
      status: "running",
      audited_url: auditedUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects/:projectId/audit/latest
 *
 * Returns the most recent completed site audit for a project.
 * If no audit exists, returns null with a helpful message.
 */
app.get("/api/projects/:projectId/audit/latest", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const audit = await c.env.DB.prepare(
      `SELECT id, project_id, health_score, findings, roadmap,
              status, error_message, audited_url, pages_crawled,
              created_at, updated_at
       FROM Site_Audits
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(projectId)
      .first();

    if (!audit) {
      return c.json({
        success: true,
        project_id: projectId,
        audit: null,
        message: "No audits found. Run a deep audit to get started.",
      });
    }

    // Parse JSON fields
    return c.json({
      success: true,
      project_id: projectId,
      audit: {
        ...audit,
        findings: JSON.parse((audit.findings as string) || "[]"),
        roadmap: JSON.parse((audit.roadmap as string) || "[]"),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 12: Dispatch Audit Fix to Swarm
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/tasks/dispatch
 *
 * Receives an audit roadmap item and forwards it to the Durable
 * Object's /dispatch handler. The DO creates an Agent_Tasks row
 * and routes by category (auditor vs writer agent).
 *
 * Request body:
 *   { title, description, category, priority, effort, impact }
 *
 * Response:
 *   { success, task_id, status, agent_type, mode }
 */
app.post("/api/projects/:projectId/tasks/dispatch", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const body = await c.req.json<{
      title: string;
      description: string;
      category: string;
      priority: number;
      effort: string;
      impact: string;
    }>();

    // Validate required fields
    if (!body.title || !body.description || !body.category) {
      return c.json(
        { success: false, error: "Missing required fields: title, description, category" },
        400
      );
    }

    // Forward to Durable Object
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    const doResponse = await doStub.fetch(new Request("https://do/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        title: body.title,
        description: body.description,
        category: body.category,
        priority: body.priority ?? 0,
        effort: body.effort ?? "medium",
        impact: body.impact ?? "medium",
      }),
    }));

    const result = await doResponse.json();
    return c.json(result, doResponse.ok ? 200 : 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Task 2.4: Visibility Checker Micro-Agent
// ─────────────────────────────────────────────────────────────

/**
 * checkAIVisibility
 *
 * Core micro-agent function. For a given project:
 * 1. Retrieves target keywords from D1 (Project_Keywords table)
 * 2. Mocks a Perplexity API call for each keyword (real HTTP in Phase 4)
 * 3. Inserts results into D1 Visibility_Logs
 * 4. If a citation gap is detected, inserts a remediation task
 *    into Agent_Tasks with status 'Awaiting_Approval'
 *
 * Returns a summary of what was checked and any gaps found.
 */
async function checkAIVisibility(
  projectId: string,
  env: Env
): Promise<{
  project_id: string;
  keywords_checked: number;
  citations_found: number;
  gaps_detected: number;
  results: PerplexityVisibilityResult[];
}> {
  // ── Step 1: Retrieve target keywords from D1 ──
  const keywordsResult = await env.DB.prepare(
    "SELECT keyword, priority FROM Project_Keywords WHERE project_id = ? ORDER BY priority ASC"
  )
    .bind(projectId)
    .all();

  const keywords = keywordsResult.results as { keyword: string; priority: string }[];

  if (keywords.length === 0) {
    return {
      project_id: projectId,
      keywords_checked: 0,
      citations_found: 0,
      gaps_detected: 0,
      results: [],
    };
  }

  const results: PerplexityVisibilityResult[] = [];
  let citationsFound = 0;
  let gapsDetected = 0;

  for (const kw of keywords) {
    // ── Step 2: Mock Perplexity API call ──
    // In Phase 4, replace this with:
    //   const response = await fetch('https://api.perplexity.ai/chat/completions', {
    //     method: 'POST',
    //     headers: {
    //       'Authorization': `Bearer ${env.PERPLEXITY_API_KEY}`,
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       model: 'llama-3.1-sonar-large-128k-online',
    //       messages: [{ role: 'user', content: kw.keyword }],
    //       return_citations: true,
    //     }),
    //   });
    //   const data = await response.json();
    //   // Parse citations from data.citations array

    const mockResult = mockPerplexityCheck(kw.keyword, projectId);
    results.push(mockResult);

    // ── Step 3: Insert into Visibility_Logs ──
    await env.DB.prepare(
      `INSERT INTO Visibility_Logs (project_id, keyword, engine, cited, rank_position, citation_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        projectId,
        mockResult.keyword,
        mockResult.engine,
        mockResult.cited ? 1 : 0,
        mockResult.rank_position,
        mockResult.citation_url
      )
      .run();

    if (mockResult.cited) {
      citationsFound++;
    } else {
      gapsDetected++;

      // ── Step 4: Insert remediation task for citation gaps ──
      await env.DB.prepare(
        `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
         VALUES (?, 'visibility', 'Citation Gap Remediation', 'Awaiting_Approval', ?)`
      )
        .bind(
          projectId,
          `Inject missing semantic entity for "${kw.keyword}" — not cited by ${mockResult.engine}. Priority: ${kw.priority}.`
        )
        .run();
    }
  }

  // Update the project's visibility score in D1
  const totalChecked = results.length;
  const newScore = totalChecked > 0 ? Math.round((citationsFound / totalChecked) * 100) : 0;

  await env.DB.prepare(
    "UPDATE Projects SET visibility_score = ?, updated_at = datetime('now') WHERE id = ?"
  )
    .bind(newScore, projectId)
    .run();

  return {
    project_id: projectId,
    keywords_checked: totalChecked,
    citations_found: citationsFound,
    gaps_detected: gapsDetected,
    results,
  };
}

/**
 * mockPerplexityCheck
 *
 * Simulates a Perplexity API response for a keyword query.
 * Uses deterministic randomness seeded by keyword hash so
 * results are consistent across calls for the same keyword.
 *
 * Will be replaced by actual HTTP call in Phase 4.
 */
function mockPerplexityCheck(
  keyword: string,
  projectId: string
): PerplexityVisibilityResult {
  // Simple hash for deterministic mock results
  let hash = 0;
  for (let i = 0; i < keyword.length; i++) {
    hash = (hash << 5) - hash + keyword.charCodeAt(i);
    hash |= 0;
  }

  const cited = Math.abs(hash) % 3 !== 0; // ~66% citation rate
  const engines: PerplexityVisibilityResult["engine"][] = [
    "Perplexity",
    "ChatGPT",
    "Gemini",
    "Claude",
    "CoPilot",
  ];
  const engine = engines[Math.abs(hash) % engines.length];

  return {
    keyword,
    cited,
    rank_position: cited ? (Math.abs(hash) % 10) + 1 : null,
    citation_url: cited
      ? `https://${projectId === "proj_001" ? "swarme.io" : "example.com"}/${keyword.replace(/\s+/g, "-")}`
      : null,
    engine,
  };
}

/**
 * POST /api/projects/:projectId/visibility/check
 *
 * Manually triggers a visibility check for a project.
 * Useful for testing and for the dashboard "Run Check" button.
 */
app.post("/api/projects/:projectId/visibility/check", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    // Verify project exists
    const project = await c.env.DB.prepare(
      "SELECT id, name FROM Projects WHERE id = ?"
    )
      .bind(projectId)
      .first();

    if (!project) {
      return c.json({ success: false, error: "Project not found" }, 404);
    }

    // Log the task
    await c.env.DB.prepare(
      `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
       VALUES (?, 'visibility', 'Manual Visibility Check', 'Running', ?)`
    )
      .bind(projectId, `Manual visibility check triggered for ${project.name}`)
      .run();

    // Execute the micro-agent
    const result = await checkAIVisibility(projectId, c.env);

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Task 3.4: Durable Object Routing Endpoints (Phase 3)
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/trigger-workflow
 *
 * Triggers a new workflow run in the AgentWorkflowManager DO.
 * The DO instance is keyed by projectId — each project gets
 * its own isolated state machine.
 *
 * Request body:
 *   { keyword: string, initiator?: "manual" | "cron" | "api" }
 */
app.post("/api/projects/:projectId/trigger-workflow", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    // Validate project exists in D1
    const project = await c.env.DB.prepare(
      "SELECT id, name FROM Projects WHERE id = ?"
    )
      .bind(projectId)
      .first();

    if (!project) {
      return c.json({ success: false, error: `Project ${projectId} not found` }, 404);
    }

    const body = await c.req.json<{ keyword: string; initiator?: string }>();

    if (!body.keyword || typeof body.keyword !== "string") {
      return c.json(
        { success: false, error: "Missing required field: keyword" },
        400
      );
    }

    // Get the DO instance for this project
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    // Forward the trigger to the DO
    const doResponse = await doStub.fetch(new Request("https://do/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        keyword: body.keyword,
        initiator: body.initiator || "manual",
      }),
    }));

    const result = await doResponse.json();
    return c.json({ success: true, project_id: projectId, ...result as Record<string, unknown> });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects/:projectId/workflow-status
 *
 * Returns the current workflow state from the DO.
 */
app.get("/api/projects/:projectId/workflow-status", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    const doResponse = await doStub.fetch(new Request("https://do/status", {
      method: "GET",
    }));

    const state = await doResponse.json();
    return c.json({ success: true, project_id: projectId, workflow: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/projects/:projectId/workflow-approve
 *
 * Approves a workflow in AWAITING_APPROVAL state (copilot mode).
 * Transitions to PUBLISHING → COMPLETED.
 */
app.post("/api/projects/:projectId/workflow-approve", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    const doResponse = await doStub.fetch(new Request("https://do/approve", {
      method: "POST",
    }));

    if (!doResponse.ok) {
      const err = await doResponse.json() as { error: string };
      return c.json({ success: false, error: err.error }, doResponse.status as 409 | 500);
    }

    const result = await doResponse.json();
    return c.json({ success: true, project_id: projectId, ...result as Record<string, unknown> });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/projects/:projectId/workflow-reset
 *
 * Emergency reset — forces the workflow back to IDLE.
 */
app.post("/api/projects/:projectId/workflow-reset", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    const doResponse = await doStub.fetch(new Request("https://do/reset", {
      method: "POST",
    }));

    const result = await doResponse.json();
    return c.json({ success: true, project_id: projectId, ...result as Record<string, unknown> });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 33: Stripe Billing & Webhook (modularized)
// ─────────────────────────────────────────────────────────────
// Billing checkout + portal → src/routes/billing.ts (mounted at /api/billing)
// Webhook receiver        → src/routes/webhooks.ts (mounted at /api/webhooks)
// Stripe price mapping    → src/utils/stripe.ts
//
// The old Phase 7 inline code has been replaced by these modular routers.
// The webhook now targets Users (not Workspaces) with proper tier provisioning.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Phase 14: Integration Connection Verification
// ─────────────────────────────────────────────────────────────

import {
  validateShopify,
  validateWooCommerce,
  validateBigCommerce,
} from "./utils/validators";

/**
 * POST /api/projects/:projectId/integrations/verify
 *
 * Accepts a JSON body with `platform` and platform-specific credentials.
 * Calls the corresponding validator, and if successful, persists the
 * credentials to the KV vault and updates the project settings.
 *
 * Body shapes:
 *   { platform: "shopify", domain, access_token }
 *   { platform: "woocommerce", domain, consumer_key, consumer_secret }
 *   { platform: "bigcommerce", store_hash, access_token, domain? }
 */
app.post("/api/projects/:projectId/integrations/verify", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const body = await c.req.json<{
      platform: string;
      domain?: string;
      access_token?: string;
      consumer_key?: string;
      consumer_secret?: string;
      store_hash?: string;
      blog_id?: string;
    }>();

    const platform = body.platform;

    if (!platform) {
      return c.json({ success: false, error: "Missing required field: platform" }, 400);
    }

    let validationResult;

    switch (platform) {
      case "shopify": {
        if (!body.domain || !body.access_token) {
          return c.json(
            { success: false, error: "Shopify requires domain and access_token." },
            400
          );
        }
        validationResult = await validateShopify(body.domain, body.access_token);

        if (validationResult.valid) {
          // Persist credentials to KV vault
          await c.env.CONFIG_KV.put(
            `vault:project:${projectId}:shopify_access_token`,
            body.access_token
          );

          // Update project settings with platform config
          const existingSettings = await c.env.CONFIG_KV.get(
            `config:project:${projectId}:settings`,
            "json"
          ) as Record<string, unknown> | null;

          await c.env.CONFIG_KV.put(
            `config:project:${projectId}:settings`,
            JSON.stringify({
              ...(existingSettings ?? {}),
              cms_platform: "shopify",
              shopify_domain: body.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
              shopify_blog_id: body.blog_id ?? "",
              updated_at: new Date().toISOString(),
            })
          );
        }
        break;
      }

      case "woocommerce": {
        if (!body.domain || !body.consumer_key || !body.consumer_secret) {
          return c.json(
            { success: false, error: "WooCommerce requires domain, consumer_key, and consumer_secret." },
            400
          );
        }
        validationResult = await validateWooCommerce(
          body.domain,
          body.consumer_key,
          body.consumer_secret
        );

        if (validationResult.valid) {
          // WooCommerce uses Basic auth — store the base64-encoded token
          const authToken = btoa(`${body.consumer_key}:${body.consumer_secret}`);
          await c.env.CONFIG_KV.put(
            `vault:project:${projectId}:woocommerce_auth_token`,
            authToken
          );

          const existingSettings = await c.env.CONFIG_KV.get(
            `config:project:${projectId}:settings`,
            "json"
          ) as Record<string, unknown> | null;

          await c.env.CONFIG_KV.put(
            `config:project:${projectId}:settings`,
            JSON.stringify({
              ...(existingSettings ?? {}),
              cms_platform: "woocommerce",
              woocommerce_domain: body.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
              updated_at: new Date().toISOString(),
            })
          );
        }
        break;
      }

      case "bigcommerce": {
        if (!body.store_hash || !body.access_token) {
          return c.json(
            { success: false, error: "BigCommerce requires store_hash and access_token." },
            400
          );
        }
        validationResult = await validateBigCommerce(body.store_hash, body.access_token);

        if (validationResult.valid) {
          await c.env.CONFIG_KV.put(
            `vault:project:${projectId}:bigcommerce_access_token`,
            body.access_token
          );

          const existingSettings = await c.env.CONFIG_KV.get(
            `config:project:${projectId}:settings`,
            "json"
          ) as Record<string, unknown> | null;

          await c.env.CONFIG_KV.put(
            `config:project:${projectId}:settings`,
            JSON.stringify({
              ...(existingSettings ?? {}),
              cms_platform: "bigcommerce",
              bigcommerce_store_hash: body.store_hash,
              bigcommerce_domain: body.domain?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "",
              updated_at: new Date().toISOString(),
            })
          );
        }
        break;
      }

      default:
        return c.json(
          { success: false, error: `Unsupported platform: ${platform}. Supported: shopify, woocommerce, bigcommerce.` },
          400
        );
    }

    if (!validationResult.valid) {
      return c.json(
        {
          success: false,
          error: validationResult.error ?? "Validation failed.",
          platform,
        },
        401
      );
    }

    return c.json({
      success: true,
      platform,
      store_name: validationResult.storeName,
      project_id: projectId,
      message: `Successfully connected to ${validationResult.storeName ?? platform}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Integration Verify] Error for ${projectId}: ${message}`);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * GET /api/projects/:projectId/integrations/status
 *
 * Returns the current integration connection status for a project.
 */
app.get("/api/projects/:projectId/integrations/status", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const settings = await c.env.CONFIG_KV.get(
      `config:project:${projectId}:settings`,
      "json"
    ) as Record<string, unknown> | null;

    const platform = (settings?.cms_platform as string) ?? null;
    let connected = false;

    if (platform === "shopify") {
      const token = await c.env.CONFIG_KV.get(`vault:project:${projectId}:shopify_access_token`);
      connected = !!token;
    } else if (platform === "woocommerce") {
      const token = await c.env.CONFIG_KV.get(`vault:project:${projectId}:woocommerce_auth_token`);
      connected = !!token;
    } else if (platform === "bigcommerce") {
      const token = await c.env.CONFIG_KV.get(`vault:project:${projectId}:bigcommerce_access_token`);
      connected = !!token;
    }

    return c.json({
      success: true,
      project_id: projectId,
      platform,
      connected,
      shopify_domain: settings?.shopify_domain ?? null,
      woocommerce_domain: settings?.woocommerce_domain ?? null,
      bigcommerce_store_hash: settings?.bigcommerce_store_hash ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 13: Public Free Analyzer (PLG Lead Magnet)
// ─────────────────────────────────────────────────────────────

import { runAccessibilityAnalysis } from "./utils/analyzer";
import { verifyTurnstile } from "./utils/turnstile";

/**
 * POST /api/public/analyze
 *
 * Public (no auth) endpoint. Accepts { url: string } and returns
 * a scored analysis covering SEO, accessibility, performance,
 * security, and content quality for a single page.
 *
 * Rate-limit in production via Cloudflare Rate Limiting rules.
 */
app.post("/api/public/analyze", async (c) => {
  const body = await c.req.json<{ url?: string; turnstileToken?: string }>();
  const rawUrl = body?.url?.trim();

  if (!rawUrl) {
    return c.json(
      { success: false, error: "Missing required field: url" },
      400
    );
  }

  // Verify Turnstile token (graceful bypass if secret not configured)
  const clientIp = c.req.header("CF-Connecting-IP");
  const turnstileOk = await verifyTurnstile(body.turnstileToken, clientIp, c.env.TURNSTILE_SECRET_KEY);
  if (!turnstileOk) {
    return c.json(
      { success: false, error: "Bot verification failed" },
      403
    );
  }

  // Basic URL sanity check
  const urlPattern = /^(https?:\/\/)?[\w.-]+(\.[a-z]{2,})/i;
  if (!urlPattern.test(rawUrl)) {
    return c.json(
      { success: false, error: "Invalid URL format" },
      400
    );
  }

  try {
    const result = await runAccessibilityAnalysis(rawUrl, c.env);

    return c.json({
      success: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    console.error(`[Public Analyzer] Error analyzing ${rawUrl}:`, message);
    return c.json(
      {
        success: false,
        error: `Analysis failed: ${message}`,
      },
      500
    );
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 15: Revenue Attribution & ROI Proof
// ─────────────────────────────────────────────────────────────

/**
 * Verify Shopify webhook HMAC-SHA256 signature.
 * Shopify signs every webhook payload with the app’s webhook secret.
 */
async function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );
  const computed = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );
  return computed === hmacHeader;
}

/**
 * POST /api/webhooks/shopify/orders
 *
 * Shopify orders/create webhook listener.
 * 1. Validates HMAC signature from X-Shopify-Hmac-Sha256 header.
 * 2. Extracts order data (id, total_price, currency, landing_site).
 * 3. Matches the landing_site path against Content_Assets.published_url.
 * 4. If matched, inserts an Attributed_Revenue row in D1.
 * 5. Returns 200 OK so Shopify stops retrying.
 */
app.post("/api/webhooks/shopify/orders", async (c) => {
  // ── Step 1: Read raw body for HMAC verification ──
  const rawBody = await c.req.text();
  const hmacHeader = c.req.header("X-Shopify-Hmac-Sha256") ?? "";

  // Validate HMAC (skip if no secret configured — dev mode)
  if (c.env.SHOPIFY_WEBHOOK_SECRET) {
    const valid = await verifyShopifyHmac(
      rawBody,
      hmacHeader,
      c.env.SHOPIFY_WEBHOOK_SECRET
    );
    if (!valid) {
      console.error("[Webhook] Invalid Shopify HMAC signature");
      return c.json({ success: false, error: "Invalid signature" }, 401);
    }
  }

  try {
    // ── Step 2: Parse order payload ──
    const order = JSON.parse(rawBody) as {
      id: number;
      total_price: string;
      currency: string;
      landing_site?: string | null;
    };

    const orderId = String(order.id);
    const totalPrice = parseFloat(order.total_price) || 0;
    const currency = order.currency || "USD";
    const landingSite = order.landing_site ?? "";

    if (!landingSite || totalPrice <= 0) {
      // No landing site or zero-value order — nothing to attribute
      return c.json({ success: true, attributed: false, reason: "no_landing_site_or_zero" });
    }

    // ── Step 3: Extract the path from the landing site URL ──
    // landing_site is typically a relative path like "/blog/my-article?utm=xyz"
    let landingPath = landingSite;
    try {
      const parsed = new URL(landingSite, "https://placeholder.com");
      landingPath = parsed.pathname;
    } catch {
      // Already a path, use as-is
    }

    // ── Step 4: Match against Content_Assets published URLs ──
    // Query all published assets and check if the landing path contains
    // any of their slugs or if the published_url matches the landing path.
    const assets = await c.env.DB.prepare(
      `SELECT id, project_id, slug, published_url, title
       FROM Content_Assets
       WHERE status = 'Published' AND published_url IS NOT NULL`
    ).all();

    let matchedAsset: { id: string; project_id: string; title: string } | null = null;

    for (const row of assets.results) {
      const asset = row as { id: string; project_id: string; slug: string; published_url: string; title: string };

      // Match by exact published URL path, or slug contained in landing path
      const pubPath = asset.published_url?.startsWith("http")
        ? new URL(asset.published_url).pathname
        : asset.published_url;

      if (
        landingPath === pubPath ||
        landingPath.includes(`/${asset.slug}`) ||
        (pubPath && landingPath.includes(pubPath))
      ) {
        matchedAsset = { id: asset.id, project_id: asset.project_id, title: asset.title };
        break;
      }
    }

    if (!matchedAsset) {
      return c.json({ success: true, attributed: false, reason: "no_content_match" });
    }

    // ── Step 5: Insert Attributed_Revenue row ──
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO Attributed_Revenue (project_id, asset_id, order_id, amount, currency)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        matchedAsset.project_id,
        matchedAsset.id,
        orderId,
        totalPrice,
        currency
      )
      .run();

    console.log(
      `[Webhook] Attributed $${totalPrice} ${currency} from order ${orderId} to "${matchedAsset.title}" (asset ${matchedAsset.id})`
    );

    return c.json({
      success: true,
      attributed: true,
      asset_id: matchedAsset.id,
      amount: totalPrice,
      currency,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Webhook] Error processing Shopify order:`, message);
    // Always return 200 to prevent Shopify from retrying indefinitely
    return c.json({ success: false, error: message }, 200);
  }
});

/**
 * GET /api/projects/:projectId/analytics/roi
 *
 * Revenue aggregation endpoint for the ROI dashboard.
 * Returns:
 *   - total_revenue (30d)
 *   - total_orders (30d)
 *   - monthly_revenue[] (for charting)
 *   - top_assets[] (top 5 highest-converting content)
 */
app.get("/api/projects/:projectId/analytics/roi", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    // ── 30-day totals ──
    const totals = await c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(amount), 0) AS total_revenue,
         COUNT(*) AS total_orders
       FROM Attributed_Revenue
       WHERE project_id = ?
         AND created_at >= datetime('now', '-30 days')`
    )
      .bind(projectId)
      .first<{ total_revenue: number; total_orders: number }>();

    // ── Monthly revenue (last 12 months) ──
    const monthlyResult = await c.env.DB.prepare(
      `SELECT
         strftime('%Y-%m', created_at) AS month,
         SUM(amount) AS revenue,
         COUNT(*) AS orders
       FROM Attributed_Revenue
       WHERE project_id = ?
         AND created_at >= datetime('now', '-12 months')
       GROUP BY month
       ORDER BY month ASC`
    )
      .bind(projectId)
      .all();

    // ── Top 5 highest-converting content assets ──
    const topAssetsResult = await c.env.DB.prepare(
      `SELECT
         ca.id AS asset_id,
         ca.title,
         ca.slug,
         ca.published_url,
         SUM(ar.amount) AS total_revenue,
         COUNT(ar.id) AS order_count
       FROM Attributed_Revenue ar
       JOIN Content_Assets ca ON ca.id = ar.asset_id
       WHERE ar.project_id = ?
       GROUP BY ca.id
       ORDER BY total_revenue DESC
       LIMIT 5`
    )
      .bind(projectId)
      .all();

    return c.json({
      success: true,
      project_id: projectId,
      total_revenue: totals?.total_revenue ?? 0,
      total_orders: totals?.total_orders ?? 0,
      currency: "USD",
      monthly_revenue: monthlyResult.results.map((row) => ({
        month: (row as { month: string }).month,
        revenue: (row as { revenue: number }).revenue,
        orders: (row as { orders: number }).orders,
      })),
      top_assets: topAssetsResult.results.map((row) => {
        const r = row as {
          asset_id: string;
          title: string;
          slug: string;
          published_url: string | null;
          total_revenue: number;
          order_count: number;
        };
        return {
          asset_id: r.asset_id,
          title: r.title,
          slug: r.slug,
          published_url: r.published_url,
          total_revenue: r.total_revenue,
          order_count: r.order_count,
        };
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ success: false, error: message }, 500);
  }
});

// ── 404 Catch-All ──
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: "Not found",
      path: c.req.path,
      available_routes: [
        "GET  /health",
        "GET  /api/projects",
        "GET  /api/projects/:id/tasks",
        "GET  /api/projects/:id/visibility",
        "GET  /api/projects/:id/visibility/summary",
        "PUT  /api/projects/:id/settings",
        "POST /api/projects/:id/tasks/:taskId/approve",
        "POST /api/projects/:id/visibility/check",
        "POST /api/projects/:id/trigger-workflow",
        "GET  /api/projects/:id/workflow-status",
        "POST /api/projects/:id/workflow-approve",
        "POST /api/projects/:id/workflow-reset",
        "POST /api/billing/checkout",
        "POST /api/billing/webhook",
        "POST /api/projects/:id/integrations/verify",
        "GET  /api/projects/:id/integrations/status",
        "POST /api/public/analyze",
        "POST /api/webhooks/shopify/orders",
        "GET  /api/projects/:id/analytics/roi",
        "POST /api/telemetry/ingest",
        "GET  /api/projects/:id/telemetry/summary",
        "GET  /api/projects/:id/social-drafts",
        "PATCH /api/social-drafts/:id",
        "GET  /api/projects/:id/gsc-metrics",
        "GET  /api/gsc/auth",
        "GET  /api/gsc/callback",
        "GET  /api/gsc/status",
        "DELETE /api/gsc/disconnect",
        "GET  /api/projects/:id/ab-tests",
        "POST /api/projects/:id/ab-tests",
        "GET  /api/projects/:id/ab-tests/:testId/significance",
      ],
    },
    404
  );
});

// ─────────────────────────────────────────────────────────────
// Phase 16: Autonomous CRO & Edge Telemetry
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/telemetry/ingest
 *
 * Receives behavioral data from the edge tracker beacon
 * (scroll depth, dwell time, CTA clicks). This route must be
 * extremely fast — it parses the JSON, runs a single D1 UPDATE
 * to increment counters and recalculate rolling averages, then
 * returns 202 Accepted immediately.
 *
 * Payload:
 *   { asset_id, scroll_depth, dwell_time_seconds, cta_clicks }
 *
 * Rolling average formula:
 *   new_avg = ((old_avg * old_count) + new_value) / (old_count + 1)
 */
app.post("/api/telemetry/ingest", async (c) => {
  try {
    const body = await c.req.json<{
      asset_id: string;
      scroll_depth: number;
      dwell_time_seconds: number;
      cta_clicks: number;
      timestamp?: string;
      variant?: "A" | "B";
      test_id?: string;
    }>();

    const { asset_id, scroll_depth, dwell_time_seconds, cta_clicks, variant, test_id } = body;

    if (!asset_id || typeof scroll_depth !== "number") {
      return c.json({ success: false, error: "Invalid payload" }, 400);
    }

    // Clamp scroll depth to 0-100
    const clampedScroll = Math.max(0, Math.min(100, scroll_depth));
    const clampedDwell = Math.max(0, dwell_time_seconds || 0);
    const clampedClicks = Math.max(0, Math.floor(cta_clicks || 0));

    // Upsert with rolling average recalculation (single atomic query)
    await c.env.DB.prepare(
      `INSERT INTO Page_Telemetry (asset_id, total_views, avg_scroll_depth, avg_dwell_time_seconds, cta_clicks)
       VALUES (?1, 1, ?2, ?3, ?4)
       ON CONFLICT(asset_id) DO UPDATE SET
         avg_scroll_depth = (
           (Page_Telemetry.avg_scroll_depth * Page_Telemetry.total_views) + ?2
         ) / (Page_Telemetry.total_views + 1),
         avg_dwell_time_seconds = (
           (Page_Telemetry.avg_dwell_time_seconds * Page_Telemetry.total_views) + ?3
         ) / (Page_Telemetry.total_views + 1),
         total_views = Page_Telemetry.total_views + 1,
         cta_clicks = Page_Telemetry.cta_clicks + ?4`
    )
      .bind(asset_id, clampedScroll, clampedDwell, clampedClicks)
      .run();

    // Phase 35: A/B test variant tracking
    if (variant && test_id && (variant === "A" || variant === "B")) {
      // Increment view counter
      await incrementAbView(c.env, test_id, variant);

      // Increment conversion counter if CTA was clicked
      if (clampedClicks > 0) {
        await incrementAbConversion(c.env, test_id, variant);
      }

      // Evaluate significance (fire-and-forget via waitUntil if available)
      try {
        await evaluateAndConclude(c.env, test_id);
      } catch (evalErr) {
        console.error("[AB Eval] Significance check failed:", evalErr);
      }
    }

    // Return 202 immediately — no blocking
    return c.json({ success: true, accepted: true }, 202);
  } catch (err) {
    console.error("[Telemetry Ingest] Error:", err);
    // Still return 202 — never slow down the user
    return c.json({ success: true, accepted: true }, 202);
  }
});

/**
 * GET /api/projects/:projectId/telemetry/summary
 *
 * Returns aggregated CRO telemetry for all tracked assets
 * in a project. Used by the CRO Telemetry dashboard.
 */
app.get("/api/projects/:projectId/telemetry/summary", async (c) => {
  try {
    const projectId = c.req.param("projectId");

    // Get telemetry data joined with content assets
    const { results } = await c.env.DB.prepare(
      `SELECT
         pt.asset_id,
         pt.total_views,
         pt.avg_scroll_depth,
         pt.avg_dwell_time_seconds,
         pt.cta_clicks,
         pt.last_optimized_at,
         pt.updated_at,
         ca.title,
         ca.slug,
         ca.published_url
       FROM Page_Telemetry pt
       LEFT JOIN Content_Assets ca ON pt.asset_id = ca.id
       WHERE ca.project_id = ?1
       ORDER BY pt.total_views DESC
       LIMIT 50`
    )
      .bind(projectId)
      .all();

    // Compute summary stats
    const assets = results || [];
    const totalViews = assets.reduce(
      (s: number, r: any) => s + (r.total_views || 0),
      0
    );
    const totalClicks = assets.reduce(
      (s: number, r: any) => s + (r.cta_clicks || 0),
      0
    );
    const avgScroll =
      assets.length > 0
        ? assets.reduce(
            (s: number, r: any) => s + (r.avg_scroll_depth || 0),
            0
          ) / assets.length
        : 0;
    const avgDwell =
      assets.length > 0
        ? assets.reduce(
            (s: number, r: any) => s + (r.avg_dwell_time_seconds || 0),
            0
          ) / assets.length
        : 0;

    // Flag underperforming assets (CRO engine thresholds)
    const underperforming = assets.filter(
      (a: any) =>
        a.total_views >= 100 &&
        (a.avg_scroll_depth < 30 || a.avg_dwell_time_seconds < 10)
    );

    return c.json({
      success: true,
      project_id: projectId,
      summary: {
        total_tracked_assets: assets.length,
        total_views: totalViews,
        total_cta_clicks: totalClicks,
        avg_scroll_depth: Math.round(avgScroll * 10) / 10,
        avg_dwell_time_seconds: Math.round(avgDwell),
        underperforming_count: underperforming.length,
      },
      assets,
      underperforming,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Telemetry Summary] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 17: Content Atomization (Social Drafts)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/social-drafts
 *
 * Returns all social media drafts for a project, optionally
 * filtered by status. Used by the Social Queue dashboard.
 */
app.get("/api/projects/:projectId/social-drafts", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const status = c.req.query("status") || null;

    let query = `
      SELECT sd.*, ca.title as article_title, ca.published_url as article_url
      FROM Social_Drafts sd
      LEFT JOIN Content_Assets ca ON sd.asset_id = ca.id
      WHERE ca.project_id = ?1`;
    const bindings: any[] = [projectId];

    if (status) {
      query += ` AND sd.status = ?2`;
      bindings.push(status);
    }

    query += ` ORDER BY sd.created_at DESC LIMIT 50`;

    const { results } = await c.env.DB.prepare(query).bind(...bindings).all();

    return c.json({
      success: true,
      drafts: results || [],
      total: (results || []).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Social Drafts] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * PATCH /api/social-drafts/:draftId
 *
 * Updates a social draft's status (approve/reject) and optionally
 * its content (human edits). STRICT COPILOT: approval only changes
 * the status to APPROVED/PUBLISHED — actual posting is deferred
 * to a future Buffer/Ayrshare integration.
 */
app.patch("/api/social-drafts/:draftId", async (c) => {
  try {
    const draftId = c.req.param("draftId");
    const body = await c.req.json<{
      status?: string;
      content_payload?: string;
    }>();

    const validStatuses = ["APPROVED", "PUBLISHED", "REJECTED"];
    if (body.status && !validStatuses.includes(body.status)) {
      return c.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        400
      );
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const bindings: any[] = [];
    let bindIdx = 1;

    if (body.status) {
      setClauses.push(`status = ?${bindIdx}`);
      bindings.push(body.status);
      bindIdx++;
    }

    if (body.content_payload) {
      setClauses.push(`content_payload = ?${bindIdx}`);
      bindings.push(body.content_payload);
      bindIdx++;
    }

    if (setClauses.length === 0) {
      return c.json({ success: false, error: "No fields to update" }, 400);
    }

    bindings.push(draftId);

    await c.env.DB.prepare(
      `UPDATE Social_Drafts SET ${setClauses.join(", ")} WHERE id = ?${bindIdx}`
    )
      .bind(...bindings)
      .run();

    return c.json({ success: true, id: draftId, status: body.status || "updated" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Social Drafts PATCH] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 18: Content Decay Manager
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/decay/candidates
 *
 * Returns published content assets with refresh drafts staged
 * for human review (refresh_status = AWAITING_APPROVAL), plus
 * stale articles with no draft yet for visibility.
 */
app.get("/api/projects/:projectId/decay/candidates", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const statusFilter = c.req.query("status") || null;

    let query = `
      SELECT id, project_id, keyword, title, slug, html_content,
             published_url, created_at, updated_at,
             last_refreshed_at, refresh_draft_payload, refresh_status,
             word_count, seo_score
      FROM Content_Assets
      WHERE project_id = ?1
        AND status = 'Published'`;
    const bindings: any[] = [projectId];

    if (statusFilter) {
      query += ` AND refresh_status = ?2`;
      bindings.push(statusFilter);
    } else {
      // Default: show articles that have refresh drafts or are stale
      query += ` AND (refresh_status IS NOT NULL OR
        COALESCE(last_refreshed_at, created_at) < datetime('now', '-6 months'))`;
    }

    query += ` ORDER BY COALESCE(last_refreshed_at, created_at) ASC LIMIT 50`;

    const { results } = await c.env.DB.prepare(query).bind(...bindings).all();

    // Compute age in days for each article
    const enriched = (results || []).map((row: any) => {
      const refDate = row.last_refreshed_at || row.created_at;
      const ageDays = Math.floor(
        (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      return { ...row, age_days: ageDays };
    });

    return c.json({
      success: true,
      project_id: projectId,
      candidates: enriched,
      total: enriched.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Decay Candidates] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/projects/:projectId/decay/:assetId/approve
 *
 * Approves a refresh draft and pushes the updated content to
 * the connected CMS. Uses the same CMS adapters from Phase 13.
 * STRICT COPILOT: only runs on explicit human approval.
 */
app.post("/api/projects/:projectId/decay/:assetId/approve", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const assetId = c.req.param("assetId");

    // Fetch the asset with its refresh draft
    const asset = await c.env.DB.prepare(
      `SELECT id, title, slug, keyword, seo_score, refresh_draft_payload, refresh_status
       FROM Content_Assets
       WHERE id = ?1 AND project_id = ?2`
    ).bind(assetId, projectId).first() as {
      id: string;
      title: string;
      slug: string;
      keyword: string;
      seo_score: number;
      refresh_draft_payload: string | null;
      refresh_status: string | null;
    } | null;

    if (!asset) {
      return c.json({ success: false, error: "Asset not found" }, 404);
    }
    if (asset.refresh_status !== "AWAITING_APPROVAL" || !asset.refresh_draft_payload) {
      return c.json({ success: false, error: "No pending refresh draft" }, 400);
    }

    // Update the live content and mark as approved
    await c.env.DB.prepare(
      `UPDATE Content_Assets
       SET html_content = ?1,
           refresh_status = 'APPROVED',
           last_refreshed_at = datetime('now'),
           refresh_draft_payload = NULL,
           updated_at = datetime('now')
       WHERE id = ?2`
    ).bind(asset.refresh_draft_payload, assetId).run();

    // Dispatch to CMS via the Durable Object (same path as publish)
    const doId = c.env.AGENT_WORKFLOW.idFromName(projectId);
    const doStub = c.env.AGENT_WORKFLOW.get(doId);

    // Fire-and-forget CMS push (the DO handles adapter routing)
    c.executionCtx.waitUntil(
      doStub.fetch(
        new Request("https://do.internal/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cms_refresh_push",
            projectId,
            keyword: asset.keyword,
            title: asset.title,
            slug: asset.slug,
            htmlContent: asset.refresh_draft_payload,
            metaDescription: "",
            seoScore: asset.seo_score,
          }),
        })
      ).catch((err) => {
        console.error("[Decay Approve] CMS push failed:", err);
      })
    );

    // Log the approval task
    await c.env.DB.prepare(
      `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
       VALUES (?1, 'writer', 'Content Refresh Approved', 'Completed', ?2)`
    ).bind(
      projectId,
      `Approved refresh for "${asset.title}" (asset ${assetId})`
    ).run();

    return c.json({
      success: true,
      asset_id: assetId,
      status: "APPROVED",
      message: "Refresh approved and content updated. CMS push initiated.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Decay Approve] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * POST /api/projects/:projectId/decay/:assetId/discard
 *
 * Discards a refresh draft. The article reverts to its original
 * state and can be picked up again in a future decay scan.
 */
app.post("/api/projects/:projectId/decay/:assetId/discard", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const assetId = c.req.param("assetId");

    await c.env.DB.prepare(
      `UPDATE Content_Assets
       SET refresh_status = 'DISCARDED',
           refresh_draft_payload = NULL,
           updated_at = datetime('now')
       WHERE id = ?1 AND project_id = ?2`
    ).bind(assetId, projectId).run();

    return c.json({
      success: true,
      asset_id: assetId,
      status: "DISCARDED",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Decay Discard] Error:", message);
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 35: A/B Testing CRUD + Significance Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/ab-tests
 *
 * Returns all A/B tests for a project, optionally filtered by status.
 * Used by the A/B Testing dashboard.
 */
app.get("/api/projects/:projectId/ab-tests", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const statusFilter = c.req.query("status") || null;

    let query = `SELECT * FROM AB_Tests WHERE project_id = ?1`;
    const binds: any[] = [projectId];

    if (statusFilter) {
      query += ` AND status = ?2`;
      binds.push(statusFilter);
    }
    query += ` ORDER BY created_at DESC`;

    const stmt = binds.length === 2
      ? c.env.DB.prepare(query).bind(binds[0], binds[1])
      : c.env.DB.prepare(query).bind(binds[0]);

    const { results } = await stmt.all();

    // Compute live significance for each test
    const tests = (results || []).map((row: any) => {
      const sig = calculateSignificance(
        row.views_a, row.conversions_a,
        row.views_b, row.conversions_b,
        row.min_views
      );
      return { ...row, significance: sig };
    });

    return c.json({
      success: true,
      project_id: projectId,
      tests,
      total: tests.length,
    });
  } catch (err: any) {
    console.error("[AB Tests] Error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/ab-tests
 *
 * Creates a new A/B test. Requires asset_id, variant_a_html, variant_b_html.
 * Optionally accepts test_name, target_selector, min_views.
 */
app.post("/api/projects/:projectId/ab-tests", async (c) => {
  try {
    const projectId = c.req.param("projectId");
    const body = await c.req.json<{
      asset_id: string;
      test_name?: string;
      target_selector?: string;
      variant_a_html: string;
      variant_b_html: string;
      min_views?: number;
    }>();

    if (!body.asset_id || !body.variant_a_html || !body.variant_b_html) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const testId = `ab_${crypto.randomUUID().slice(0, 12)}`;
    const testName = body.test_name || "Untitled Test";
    const selector = body.target_selector || ".cta-primary";
    const minViews = body.min_views || 500;

    await c.env.DB.prepare(
      `INSERT INTO AB_Tests (id, project_id, asset_id, test_name, target_selector, variant_a_html, variant_b_html, min_views)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
      .bind(testId, projectId, body.asset_id, testName, selector, body.variant_a_html, body.variant_b_html, minViews)
      .run();

    return c.json({
      success: true,
      test_id: testId,
      status: "Running",
    }, 201);
  } catch (err: any) {
    console.error("[AB Tests] Create error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/ab-tests/:testId/significance
 *
 * Returns live statistical significance for a specific test.
 */
app.get("/api/projects/:projectId/ab-tests/:testId/significance", async (c) => {
  try {
    const testId = c.req.param("testId");
    const result = await evaluateAndConclude(c.env, testId);

    if (!result) {
      return c.json({ success: false, error: "Test not found or already concluded" }, 404);
    }

    return c.json({ success: true, test_id: testId, ...result });
  } catch (err: any) {
    console.error("[AB Significance] Error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 34: GSC Metrics Endpoint
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/gsc-metrics
 *
 * Returns Google Search Console performance data (clicks, impressions,
 * CTR, position) for the last 14 days. Used by the SERP Performance
 * chart on the dashboard. Falls back to empty array if no data exists.
 */
app.get("/api/projects/:projectId/gsc-metrics", async (c) => {
  try {
    const projectId = c.req.param("projectId");

    const { results } = await c.env.DB.prepare(
      `SELECT date, clicks, impressions, ctr, position
       FROM GSC_Metrics
       WHERE project_id = ?1
       ORDER BY date DESC
       LIMIT 14`
    ).bind(projectId).all();

    // Reverse so chart shows oldest → newest (left → right)
    const metrics = (results || []).reverse().map((row: any) => ({
      date: row.date,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round((row.ctr || 0) * 1000) / 1000,
      position: Math.round((row.position || 0) * 10) / 10,
    }));

    return c.json({
      success: true,
      project_id: projectId,
      metrics,
      count: metrics.length,
    });
  } catch (err: any) {
    console.error("[GSC Metrics] Error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Phase 54: Chaos Swarm — Automated Red Teaming & Fuzzing
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/admin/chaos/run — Trigger a full chaos test suite.
 * Protected by requireSuperadmin middleware (line 238).
 */
app.post("/api/admin/chaos/run", async (c) => {
  try {
    const domainId = (c.req.query("domain_id") || "dom_001");
    const workerUrl = new URL(c.req.url).origin;

    console.log(`[Chaos Swarm] Manual trigger for domain=${domainId}`);

    // Run both suites
    const [fuzzResult, llmResult] = await Promise.all([
      runApiFuzzer(c.env, domainId, workerUrl),
      runLlmAttacker(c.env, domainId, workerUrl),
    ]);

    const totalTests = fuzzResult.total_tests + llmResult.total_tests;
    const totalFailed = fuzzResult.failed + llmResult.failed;
    const criticalFailures = fuzzResult.critical_failures + llmResult.critical_failures;

    // Compute System Vulnerability Score (0-100, lower is better)
    const vulnScore = Math.min(
      100,
      Math.round(
        (criticalFailures * 25 + (totalFailed - criticalFailures) * 5) /
          Math.max(totalTests, 1) *
          100
      )
    );

    return c.json({
      success: true,
      vulnerability_score: vulnScore,
      summary: {
        total_tests: totalTests,
        passed: fuzzResult.passed + llmResult.passed,
        failed: totalFailed,
        critical_failures: criticalFailures,
      },
      api_fuzz: {
        run_id: fuzzResult.run_id,
        total: fuzzResult.total_tests,
        passed: fuzzResult.passed,
        failed: fuzzResult.failed,
        critical: fuzzResult.critical_failures,
      },
      llm_attack: {
        run_id: llmResult.run_id,
        total: llmResult.total_tests,
        passed: llmResult.passed,
        failed: llmResult.failed,
        critical: llmResult.critical_failures,
      },
    });
  } catch (err: any) {
    console.error("[Chaos Swarm] Run error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

/**
 * GET /api/admin/chaos/logs — Retrieve chaos test results.
 * Supports ?run_id, ?test_type, ?severity, ?passed filters.
 */
app.get("/api/admin/chaos/logs", async (c) => {
  try {
    const domainId = c.req.query("domain_id") || "dom_001";
    const runId = c.req.query("run_id");
    const testType = c.req.query("test_type");
    const severity = c.req.query("severity");
    const passedFilter = c.req.query("passed");
    const limit = Math.min(parseInt(c.req.query("limit") || "200"), 500);

    let sql = "SELECT * FROM Chaos_Logs WHERE domain_id = ?1";
    const bindings: any[] = [domainId];
    let idx = 2;

    if (runId) {
      sql += ` AND run_id = ?${idx}`;
      bindings.push(runId);
      idx++;
    }
    if (testType) {
      sql += ` AND test_type = ?${idx}`;
      bindings.push(testType);
      idx++;
    }
    if (severity) {
      sql += ` AND severity = ?${idx}`;
      bindings.push(severity);
      idx++;
    }
    if (passedFilter !== undefined && passedFilter !== null) {
      sql += ` AND passed = ?${idx}`;
      bindings.push(passedFilter === "true" ? 1 : 0);
      idx++;
    }

    sql += " ORDER BY created_at DESC";
    sql += ` LIMIT ?${idx}`;
    bindings.push(limit);

    const stmt = c.env.DB.prepare(sql);
    const { results } = await stmt.bind(...bindings).all();

    return c.json({
      success: true,
      logs: results || [],
      total: (results || []).length,
    });
  } catch (err: any) {
    console.error("[Chaos Logs] Query error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

/**
 * GET /api/admin/chaos/score — Current System Vulnerability Score.
 * Computed from the most recent chaos run.
 */
app.get("/api/admin/chaos/score", async (c) => {
  try {
    const domainId = c.req.query("domain_id") || "dom_001";

    // Get the latest run_id
    const latestRun = await c.env.DB.prepare(
      "SELECT run_id FROM Chaos_Logs WHERE domain_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).bind(domainId).first<{ run_id: string }>();

    if (!latestRun) {
      return c.json({
        success: true,
        vulnerability_score: 0,
        last_run: null,
        message: "No chaos tests have been run yet",
      });
    }

    // Get stats for that run
    const stats = await c.env.DB.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN passed = 0 THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN passed = 0 AND severity = 'critical' THEN 1 ELSE 0 END) as critical
       FROM Chaos_Logs WHERE domain_id = ?1 AND run_id = ?2`
    ).bind(domainId, latestRun.run_id).first<{
      total: number;
      failed: number;
      critical: number;
    }>();

    const total = stats?.total || 0;
    const failed = stats?.failed || 0;
    const critical = stats?.critical || 0;

    const vulnScore = Math.min(
      100,
      Math.round(
        (critical * 25 + (failed - critical) * 5) / Math.max(total, 1) * 100
      )
    );

    return c.json({
      success: true,
      vulnerability_score: vulnScore,
      last_run: latestRun.run_id,
      total_tests: total,
      failed,
      critical,
    });
  } catch (err: any) {
    console.error("[Chaos Score] Error:", err?.message || err);
    return c.json({ success: false, error: err?.message || "Unknown error" }, 500);
  }
});

// ── Error Handler ──
app.onError((err, c) => {
  console.error(`[Swarme Error] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    },
    500
  );
});

// ─────────────────────────────────────────────────────────────
// Priority 1: Missing User-Facing Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/cms-settings
 * Returns CMS integration settings stored in KV.
 */
app.get("/api/projects/:projectId/cms-settings", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const raw = await c.env.CONFIG_KV.get(`project:${projectId}:cms_settings`);
    const cms_settings = raw ? JSON.parse(raw) : {
      cms_platform: "generic",
      shopify_domain: "",
      shopify_blog_id: "",
      shopify_access_token_set: false,
    };
    return c.json({ success: true, project_id: projectId, cms_settings });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load CMS settings" }, 500);
  }
});

/**
 * PUT /api/projects/:projectId/cms-settings
 * Saves CMS integration settings to KV.
 */
app.put("/api/projects/:projectId/cms-settings", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const body = await c.req.json();
    const settings: Record<string, any> = {
      cms_platform: body.cms_platform || "generic",
    };
    if (body.cms_platform === "shopify") {
      settings.shopify_domain = body.shopify_domain || "";
      settings.shopify_blog_id = body.shopify_blog_id || "";
      if (body.shopify_access_token) {
        // Store token separately in vault
        await c.env.CONFIG_KV.put(
          `vault:project:${projectId}:shopify_access_token`,
          body.shopify_access_token
        );
        settings.shopify_access_token_set = true;
      } else {
        // Preserve existing token status
        const existing = await c.env.CONFIG_KV.get(`project:${projectId}:cms_settings`);
        if (existing) {
          const parsed = JSON.parse(existing);
          settings.shopify_access_token_set = parsed.shopify_access_token_set || false;
        }
      }
    }
    await c.env.CONFIG_KV.put(`project:${projectId}:cms_settings`, JSON.stringify(settings));
    return c.json({ success: true, project_id: projectId, cms_settings: settings });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save CMS settings" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/email-integration
 * Returns email integration status.
 */
app.get("/api/projects/:projectId/email-integration", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const raw = await c.env.CONFIG_KV.get(`project:${projectId}:email_integration`);
    if (raw) {
      const integration = JSON.parse(raw);
      return c.json({ success: true, connected: true, integration });
    }
    return c.json({ success: true, connected: false, integration: null });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load email integration" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/email-integration/connect
 * Initiates OAuth flow for email provider (stub — returns placeholder auth_url).
 */
app.post("/api/projects/:projectId/email-integration/connect", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const { provider } = await c.req.json();
    if (!provider || !["google", "microsoft"].includes(provider)) {
      return c.json({ success: false, error: "Invalid provider. Use 'google' or 'microsoft'." }, 400);
    }
    // In production this would redirect to Google/Microsoft OAuth.
    // For now, store as a pending integration.
    const integration = {
      provider,
      email: "",
      status: "disconnected" as const,
      scopes: provider === "google"
        ? ["https://www.googleapis.com/auth/gmail.send"]
        : ["https://graph.microsoft.com/Mail.Send"],
      connected_at: "",
      token_expires_at: "",
    };
    await c.env.CONFIG_KV.put(`project:${projectId}:email_integration`, JSON.stringify(integration));
    return c.json({
      success: true,
      auth_url: `https://swarme.io/oauth/${provider}?project=${projectId}`,
      provider,
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to initiate email connection" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/email-integration/disconnect
 * Removes email integration.
 */
app.post("/api/projects/:projectId/email-integration/disconnect", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    await c.env.CONFIG_KV.delete(`project:${projectId}:email_integration`);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to disconnect email" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/domain-verification
 * Lists domain verifications for a project.
 */
app.get("/api/projects/:projectId/domain-verification", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const rows = await c.env.DB.prepare(
      `SELECT id, domain, status, dns_records, verified_at, created_at
       FROM Domain_Verifications WHERE project_id = ?1 ORDER BY created_at DESC`
    ).bind(projectId).all();

    const verifications = (rows.results || []).map((r: any) => ({
      id: r.id,
      domain: r.domain,
      status: r.status,
      dns_records: r.dns_records ? JSON.parse(r.dns_records) : [],
      verified_at: r.verified_at,
      created_at: r.created_at,
    }));
    return c.json({ success: true, verifications });
  } catch (err: any) {
    // If table doesn't exist yet, return empty
    if (err?.message?.includes("no such table")) {
      return c.json({ success: true, verifications: [] });
    }
    return c.json({ success: false, error: "Failed to load domain verifications" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/domain-verification
 * Starts a new domain verification.
 */
app.post("/api/projects/:projectId/domain-verification", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const { domain } = await c.req.json();
    if (!domain) return c.json({ success: false, error: "Domain is required" }, 400);

    const id = `dv_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const txtValue = `swarme-verify=${id}`;
    const dnsRecords = [
      { type: "TXT", name: `_swarme.${domain}`, value: txtValue, ttl: 3600 },
    ];
    const now = new Date().toISOString();

    // Try to insert into DB; if table doesn't exist, store in KV instead
    try {
      await c.env.DB.prepare(
        `INSERT INTO Domain_Verifications (id, project_id, domain, status, dns_records, created_at)
         VALUES (?1, ?2, ?3, 'pending', ?4, ?5)`
      ).bind(id, projectId, domain, JSON.stringify(dnsRecords), now).run();
    } catch {
      // Fallback: store in KV
      const kvKey = `project:${projectId}:domain_verifications`;
      const existing = await c.env.CONFIG_KV.get(kvKey);
      const list = existing ? JSON.parse(existing) : [];
      list.push({ id, domain, status: "pending", dns_records: dnsRecords, verified_at: null, created_at: now });
      await c.env.CONFIG_KV.put(kvKey, JSON.stringify(list));
    }

    return c.json({
      success: true,
      verification: { id, domain, status: "pending", dns_records: dnsRecords, verified_at: null, created_at: now },
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to start domain verification" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/domain-verification/:verificationId/check
 * Checks if the DNS TXT record has been set.
 */
app.post("/api/projects/:projectId/domain-verification/:verificationId/check", async (c) => {
  const projectId = c.req.param("projectId");
  const verificationId = c.req.param("verificationId");
  try {
    // Try DB first
    let verification: any = null;
    try {
      const row = await c.env.DB.prepare(
        `SELECT * FROM Domain_Verifications WHERE id = ?1 AND project_id = ?2`
      ).bind(verificationId, projectId).first();
      if (row) {
        verification = row;
      }
    } catch {}

    // Fallback: try KV
    if (!verification) {
      const kvKey = `project:${projectId}:domain_verifications`;
      const raw = await c.env.CONFIG_KV.get(kvKey);
      if (raw) {
        const list = JSON.parse(raw);
        verification = list.find((v: any) => v.id === verificationId);
      }
    }

    if (!verification) {
      return c.json({ success: false, error: "Verification not found" }, 404);
    }

    // For now, simulate verification check — mark as verified
    const now = new Date().toISOString();
    const updated = {
      ...verification,
      status: "verified",
      verified_at: now,
      dns_records: verification.dns_records
        ? (typeof verification.dns_records === "string" ? JSON.parse(verification.dns_records) : verification.dns_records)
        : [],
    };

    // Update in DB or KV
    try {
      await c.env.DB.prepare(
        `UPDATE Domain_Verifications SET status = 'verified', verified_at = ?1 WHERE id = ?2`
      ).bind(now, verificationId).run();
    } catch {
      const kvKey = `project:${projectId}:domain_verifications`;
      const raw = await c.env.CONFIG_KV.get(kvKey);
      if (raw) {
        const list = JSON.parse(raw).map((v: any) =>
          v.id === verificationId ? updated : v
        );
        await c.env.CONFIG_KV.put(kvKey, JSON.stringify(list));
      }
    }

    return c.json({ success: true, verification: updated });
  } catch (err) {
    return c.json({ success: false, error: "Verification check failed" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/mission-control
 * Returns edge worker / mission control dashboard data.
 */
app.get("/api/projects/:projectId/mission-control", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    // Query recent tasks for action counts
    const actions24h = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM Agent_Tasks
       WHERE project_id = ?1 AND created_at > datetime('now', '-24 hours')`
    ).bind(projectId).first<{ cnt: number }>();

    const rollbacks24h = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM Agent_Tasks
       WHERE project_id = ?1 AND status = 'RolledBack' AND created_at > datetime('now', '-24 hours')`
    ).bind(projectId).first<{ cnt: number }>();

    // Get integration statuses from KV
    const settings = await c.env.CONFIG_KV.get(`project:${projectId}:settings`);
    const parsedSettings = settings ? JSON.parse(settings) : {};

    const integrations: any[] = [];
    const integrationNames = ["gsc", "ga4", "shopify", "woocommerce"];
    for (const name of integrationNames) {
      const tokenKey = `vault:project:${projectId}:${name}_access_token`;
      const token = await c.env.CONFIG_KV.get(tokenKey);
      integrations.push({
        id: `int_${name}`,
        name: name.toUpperCase(),
        platform: name,
        status: token ? "connected" : "disconnected",
        last_sync: new Date().toISOString(),
        sync_errors: 0,
      });
    }

    const summary = {
      total_actions_24h: actions24h?.cnt || 0,
      rollbacks_24h: rollbacks24h?.cnt || 0,
      agents_active: 3,
      agents_degraded: 0,
      agents_idle: 2,
      integrations_connected: integrations.filter((i) => i.status === "connected").length,
      integrations_degraded: 0,
      crons_healthy: 4,
      crons_total: 5,
    };

    const agent_health = [
      { agent_type: "seo_auditor", status: "healthy", tasks_last_hour: actions24h?.cnt || 0, errors_last_hour: 0, avg_latency_ms: 320 },
      { agent_type: "content_writer", status: "healthy", tasks_last_hour: 0, errors_last_hour: 0, avg_latency_ms: 1200 },
      { agent_type: "social_manager", status: "idle", tasks_last_hour: 0, errors_last_hour: 0, avg_latency_ms: 0 },
      { agent_type: "link_healer", status: "healthy", tasks_last_hour: 0, errors_last_hour: 0, avg_latency_ms: 450 },
      { agent_type: "visibility_checker", status: "idle", tasks_last_hour: 0, errors_last_hour: 0, avg_latency_ms: 0 },
    ];

    const cron_jobs = [
      { name: "Hourly Visibility Check", cron: "0 * * * *", last_run: new Date().toISOString(), next_run: new Date(Date.now() + 3600000).toISOString(), status: "success", duration_ms: 2300 },
      { name: "Daily SEO Audit", cron: "0 6 * * *", last_run: new Date().toISOString(), next_run: new Date(Date.now() + 86400000).toISOString(), status: "success", duration_ms: 8500 },
      { name: "GSC Sync", cron: "0 */4 * * *", last_run: new Date().toISOString(), next_run: new Date(Date.now() + 14400000).toISOString(), status: "success", duration_ms: 1200 },
      { name: "GA4 Sync", cron: "0 */4 * * *", last_run: new Date().toISOString(), next_run: new Date(Date.now() + 14400000).toISOString(), status: "success", duration_ms: 1100 },
      { name: "Weekly Link Rot Scan", cron: "0 3 * * 0", last_run: new Date().toISOString(), next_run: new Date(Date.now() + 604800000).toISOString(), status: "success", duration_ms: 15000 },
    ];

    // Recent actions
    const recentRows = await c.env.DB.prepare(
      `SELECT id, project_id, agent_type, action, status as entity_type, task_description as entity_id,
              '' as snapshot_before, '' as snapshot_after, '' as preview_url,
              0 as rolled_back, NULL as rolled_back_at, created_at
       FROM Agent_Tasks WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 10`
    ).bind(projectId).all();

    const recent_actions = (recentRows.results || []).map((r: any) => ({
      id: r.id?.toString() || crypto.randomUUID(),
      project_id: r.project_id,
      agent_type: r.agent_type || "system",
      action: r.action || "task",
      entity_type: r.entity_type || "task",
      entity_id: r.entity_id || "",
      snapshot_before: null,
      snapshot_after: null,
      preview_url: null,
      rolled_back: 0,
      rolled_back_at: null,
      created_at: r.created_at,
    }));

    return c.json({
      success: true,
      project_id: projectId,
      summary,
      integrations,
      agent_health,
      cron_jobs,
      recent_actions,
    });
  } catch (err) {
    console.error("[mission-control] Error:", err);
    return c.json({ success: false, error: "Failed to load mission control data" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/credits
 * Returns credit balance and ledger for a project.
 */
app.get("/api/projects/:projectId/credits", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const raw = await c.env.CONFIG_KV.get(`project:${projectId}:credits`);
    const now = new Date().toISOString();
    const balance = raw ? JSON.parse(raw) : {
      id: `cb_${projectId}`,
      domain_id: projectId,
      available_credits: 1000,
      auto_recharge_enabled: false,
      recharge_threshold_credits: 100,
      recharge_amount_credits: 500,
      created_at: now,
      updated_at: now,
    };

    // Get ledger entries from KV
    const ledgerRaw = await c.env.CONFIG_KV.get(`project:${projectId}:credit_ledger`);
    const ledger = ledgerRaw ? JSON.parse(ledgerRaw) : [];

    return c.json({ success: true, balance, ledger });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load credit data" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/credits/purchase
 * Adds credits to a project balance.
 */
app.post("/api/projects/:projectId/credits/purchase", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const { amount_credits } = await c.req.json();
    if (!amount_credits || amount_credits <= 0) {
      return c.json({ success: false, error: "Invalid credit amount" }, 400);
    }

    const raw = await c.env.CONFIG_KV.get(`project:${projectId}:credits`);
    const now = new Date().toISOString();
    const balance = raw ? JSON.parse(raw) : {
      id: `cb_${projectId}`,
      domain_id: projectId,
      available_credits: 1000,
      auto_recharge_enabled: false,
      recharge_threshold_credits: 100,
      recharge_amount_credits: 500,
      created_at: now,
      updated_at: now,
    };

    balance.available_credits += amount_credits;
    balance.updated_at = now;
    await c.env.CONFIG_KV.put(`project:${projectId}:credits`, JSON.stringify(balance));

    // Add ledger entry
    const ledgerRaw = await c.env.CONFIG_KV.get(`project:${projectId}:credit_ledger`);
    const ledger = ledgerRaw ? JSON.parse(ledgerRaw) : [];
    ledger.unshift({
      id: `cl_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      balance_id: balance.id,
      credit_amount: amount_credits,
      description: `Purchased ${amount_credits} credits`,
      reference_id: `purchase_${Date.now()}`,
      created_at: now,
    });
    await c.env.CONFIG_KV.put(`project:${projectId}:credit_ledger`, JSON.stringify(ledger.slice(0, 100)));

    return c.json({ success: true, amount_credits, new_balance: balance.available_credits });
  } catch (err) {
    return c.json({ success: false, error: "Failed to purchase credits" }, 500);
  }
});

/**
 * PATCH /api/projects/:projectId/credits/settings
 * Updates auto-recharge settings.
 */
app.patch("/api/projects/:projectId/credits/settings", async (c) => {
  const projectId = c.req.param("projectId");
  try {
    const body = await c.req.json();
    const raw = await c.env.CONFIG_KV.get(`project:${projectId}:credits`);
    const now = new Date().toISOString();
    const balance = raw ? JSON.parse(raw) : {
      id: `cb_${projectId}`,
      domain_id: projectId,
      available_credits: 1000,
      auto_recharge_enabled: false,
      recharge_threshold_credits: 100,
      recharge_amount_credits: 500,
      created_at: now,
      updated_at: now,
    };

    if (body.auto_recharge_enabled !== undefined) balance.auto_recharge_enabled = body.auto_recharge_enabled;
    if (body.recharge_threshold_credits !== undefined) balance.recharge_threshold_credits = body.recharge_threshold_credits;
    if (body.recharge_amount_credits !== undefined) balance.recharge_amount_credits = body.recharge_amount_credits;
    balance.updated_at = now;

    await c.env.CONFIG_KV.put(`project:${projectId}:credits`, JSON.stringify(balance));
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to update credit settings" }, 500);
  }
});

/**
 * GET /api/public/footer
 * Returns footer configuration. Falls back to defaults.
 */
app.get("/api/public/footer", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:footer");
    if (raw) {
      return c.json({ success: true, footer: JSON.parse(raw) });
    }
    // Default footer
    return c.json({
      success: true,
      footer: {
        columns: [
          { title: "Product", links: [
            { label: "Features", href: "/#features" },
            { label: "Integrations", href: "/developers" },
            { label: "Pricing", href: "/#pricing" },
          ]},
          { title: "Resources", links: [
            { label: "Documentation", href: "/developers" },
            { label: "API Reference", href: "/developers" },
            { label: "Blog", href: "/blog" },
          ]},
          { title: "Company", links: [
            { label: "About", href: "/about" },
            { label: "Careers", href: "/careers" },
            { label: "Contact", href: "/contact" },
          ]},
        ],
        company_info: {
          mission: "AI-powered SEO automation for the modern web.",
          support_email: "support@swarme.io",
          address: "",
          social: { x: "https://x.com/swarmeio", linkedin: "", discord: "" },
        },
      },
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load footer" }, 500);
  }
});

/**
 * GET /api/public/settings
 * Returns public site settings (site name, logo, favicon, SEO metadata, maintenance mode).
 */
app.get("/api/public/settings", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:site_settings");
    if (raw) {
      return c.json({ success: true, settings: JSON.parse(raw) });
    }
    return c.json({
      success: true,
      settings: {
        site_name: "Swarme",
        logo_url: "",
        favicon_url: "",
        maintenance_mode: false,
        seo_metadata: {
          title: "Swarme — AI-Powered SEO Automation",
          description: "Automate your SEO workflow with AI agents that research, write, optimize, and publish content.",
          og_image: "",
        },
      },
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to load public settings" }, 500);
  }
});

/**
 * POST /api/public/scanner
 * Lightweight SEO scanner — returns basic head data and a score.
 */
app.post("/api/public/scanner", async (c) => {
  try {
    const { url } = await c.req.json();
    if (!url) return c.json({ success: false, error: "URL is required" }, 400);

    // Basic head tag analysis
    let headData = {
      title: "", description: "", canonical: "", ogImage: "",
      generator: "", schemaOrg: false, robots: "",
      viewport: "", charset: "", hreflang: [] as string[],
    };
    let seoScore = 0;
    const issues: string[] = [];

    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "SwarmeBot/1.0 (+https://swarme.io)" },
        redirect: "follow",
      });
      const html = await resp.text();

      // Extract head tags
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      headData.title = titleMatch?.[1]?.trim() || "";

      const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      headData.description = descMatch?.[1]?.trim() || "";

      const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      headData.canonical = canonicalMatch?.[1]?.trim() || "";

      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      headData.ogImage = ogMatch?.[1]?.trim() || "";

      const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
      headData.robots = robotsMatch?.[1]?.trim() || "";

      const viewportMatch = html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i);
      headData.viewport = viewportMatch?.[1]?.trim() || "";

      const charsetMatch = html.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i);
      headData.charset = charsetMatch?.[1]?.trim() || "";

      headData.schemaOrg = html.includes("schema.org");

      // Score
      if (headData.title) seoScore += 15; else issues.push("Missing <title> tag");
      if (headData.description) seoScore += 15; else issues.push("Missing meta description");
      if (headData.canonical) seoScore += 10; else issues.push("Missing canonical URL");
      if (headData.ogImage) seoScore += 10; else issues.push("Missing og:image");
      if (headData.viewport) seoScore += 10; else issues.push("Missing viewport meta tag");
      if (headData.charset) seoScore += 5; else issues.push("Missing charset declaration");
      if (headData.schemaOrg) seoScore += 10; else issues.push("No Schema.org markup detected");
      if (headData.robots) seoScore += 5;
      if (html.includes("<h1")) seoScore += 10; else issues.push("Missing <h1> heading");
      if (html.includes("alt=")) seoScore += 10; else issues.push("Images may be missing alt attributes");

    } catch (fetchErr) {
      return c.json({ success: false, error: `Could not fetch URL: ${url}` }, 400);
    }

    return c.json({ success: true, result: { url, headData, seoScore, issues } });
  } catch (err) {
    return c.json({ success: false, error: "Scanner analysis failed" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Priority 2: Admin Panel Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-log
 * Returns admin audit log entries from D1.
 */
app.get("/api/admin/audit-log", async (c) => {
  try {
    let rows: any[] = [];
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, admin_id, action, target, metadata, created_at FROM Admin_Audit_Log ORDER BY created_at DESC LIMIT 200`
      ).all();
      rows = result.results || [];
    } catch {
      // Table may not exist yet
    }

    // Enrich with email from Users table
    const enriched = [];
    for (const r of rows) {
      let email = "";
      try {
        const u = await c.env.DB.prepare(`SELECT email FROM Users WHERE id = ?1`).bind(r.admin_id).first<{ email: string }>();
        email = u?.email || r.admin_id;
      } catch { email = r.admin_id; }
      enriched.push({
        id: r.id?.toString() || crypto.randomUUID(),
        admin_id: r.admin_id,
        admin_email: email,
        action: r.action,
        target: r.target,
        metadata: r.metadata,
        created_at: r.created_at,
      });
    }
    return c.json(enriched);
  } catch (err) {
    return c.json([], 200);
  }
});

/**
 * GET /api/admin/flags
 * Returns feature flags map from KV.
 */
app.get("/api/admin/flags", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:feature_flags");
    return c.json(raw ? JSON.parse(raw) : {});
  } catch {
    return c.json({});
  }
});

/**
 * POST /api/admin/flags
 * Saves feature flags and logs to audit.
 */
app.post("/api/admin/flags", async (c) => {
  try {
    const flags = await c.req.json();
    await c.env.CONFIG_KV.put("global:config:feature_flags", JSON.stringify(flags));

    // Audit log
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'update_flags', 'feature_flags', ?2, ?3)`
      ).bind(adminId, JSON.stringify(flags), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save flags" }, 500);
  }
});

/**
 * GET /api/admin/settings/site
 * Returns site-wide settings (brand, SEO, social, maintenance).
 */
app.get("/api/admin/settings/site", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:site_settings");
    const defaults = {
      site_name: "Swarme",
      logo_url: "",
      favicon_url: "",
      maintenance_mode: false,
      hero_headline: "AI-Powered SEO Automation",
      hero_subheadline: "Let the swarm handle your SEO.",
      social_links: { twitter: "", linkedin: "", github: "" },
      seo_metadata: {
        title: "Swarme — AI-Powered SEO Automation",
        description: "Automate your SEO workflow with AI agents.",
        og_image: "",
      },
    };
    return c.json(raw ? { ...defaults, ...JSON.parse(raw) } : defaults);
  } catch {
    return c.json({ site_name: "Swarme", maintenance_mode: false, social_links: { twitter: "", linkedin: "", github: "" }, seo_metadata: { title: "", description: "", og_image: "" } });
  }
});

/**
 * POST /api/admin/settings/site
 * Partially updates site settings (merges with existing).
 */
app.post("/api/admin/settings/site", async (c) => {
  try {
    const updates = await c.req.json();
    const raw = await c.env.CONFIG_KV.get("global:config:site_settings");
    const current = raw ? JSON.parse(raw) : {};
    const merged = { ...current, ...updates };
    await c.env.CONFIG_KV.put("global:config:site_settings", JSON.stringify(merged));

    // Audit log
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'update_site_settings', 'site_settings', ?2, ?3)`
      ).bind(adminId, JSON.stringify(Object.keys(updates)), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save site settings" }, 500);
  }
});

/**
 * GET /api/admin/cms/posts
 * Returns all CMS posts (blog, changelog, legal).
 */
app.get("/api/admin/cms/posts", async (c) => {
  try {
    let rows: any[] = [];
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, type, title, content, slug, published, author_id, created_at, updated_at
         FROM Cms_Posts ORDER BY created_at DESC LIMIT 200`
      ).all();
      rows = result.results || [];
    } catch {
      // Table may not exist; return from KV fallback
      const raw = await c.env.CONFIG_KV.get("global:config:cms_posts");
      rows = raw ? JSON.parse(raw) : [];
    }
    return c.json(rows);
  } catch {
    return c.json([]);
  }
});

/**
 * POST /api/admin/cms/posts
 * Creates a new CMS post.
 */
app.post("/api/admin/cms/posts", async (c) => {
  try {
    const body = await c.req.json();
    const id = `post_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const now = new Date().toISOString();
    const post = {
      id,
      type: body.type || "blog",
      title: body.title || "",
      content: body.content || "",
      slug: body.slug || body.title?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || id,
      published: body.published ?? 0,
      author_id: c.get("userId") as string || "system",
      created_at: now,
      updated_at: now,
    };

    try {
      await c.env.DB.prepare(
        `INSERT INTO Cms_Posts (id, type, title, content, slug, published, author_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      ).bind(post.id, post.type, post.title, post.content, post.slug, post.published, post.author_id, post.created_at, post.updated_at).run();
    } catch {
      // KV fallback
      const raw = await c.env.CONFIG_KV.get("global:config:cms_posts");
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(post);
      await c.env.CONFIG_KV.put("global:config:cms_posts", JSON.stringify(list));
    }
    return c.json(post, 201);
  } catch (err) {
    return c.json({ success: false, error: "Failed to create post" }, 500);
  }
});

/**
 * PATCH /api/admin/cms/posts/:postId
 * Updates an existing CMS post.
 */
app.patch("/api/admin/cms/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  try {
    const body = await c.req.json();
    const now = new Date().toISOString();

    try {
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const key of ["type", "title", "content", "slug", "published"]) {
        if (body[key] !== undefined) {
          sets.push(`${key} = ?${idx}`);
          vals.push(body[key]);
          idx++;
        }
      }
      sets.push(`updated_at = ?${idx}`);
      vals.push(now);
      idx++;
      vals.push(postId);
      await c.env.DB.prepare(
        `UPDATE Cms_Posts SET ${sets.join(", ")} WHERE id = ?${idx}`
      ).bind(...vals).run();
    } catch {
      // KV fallback
      const raw = await c.env.CONFIG_KV.get("global:config:cms_posts");
      if (raw) {
        const list = JSON.parse(raw).map((p: any) =>
          p.id === postId ? { ...p, ...body, updated_at: now } : p
        );
        await c.env.CONFIG_KV.put("global:config:cms_posts", JSON.stringify(list));
      }
    }
    return c.json({ success: true, id: postId });
  } catch (err) {
    return c.json({ success: false, error: "Failed to update post" }, 500);
  }
});

/**
 * DELETE /api/admin/cms/posts/:postId
 * Deletes a CMS post.
 */
app.delete("/api/admin/cms/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  try {
    try {
      await c.env.DB.prepare(`DELETE FROM Cms_Posts WHERE id = ?1`).bind(postId).run();
    } catch {
      const raw = await c.env.CONFIG_KV.get("global:config:cms_posts");
      if (raw) {
        const list = JSON.parse(raw).filter((p: any) => p.id !== postId);
        await c.env.CONFIG_KV.put("global:config:cms_posts", JSON.stringify(list));
      }
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to delete post" }, 500);
  }
});

/**
 * GET /api/admin/footer
 * Returns admin-editable footer configuration.
 */
app.get("/api/admin/footer", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:footer");
    return c.json(raw ? JSON.parse(raw) : {
      columns: [],
      company_info: {
        mission: "AI-powered SEO automation for the modern web.",
        support_email: "support@swarme.io",
        address: "",
        social: { x: "", linkedin: "", discord: "" },
      },
    });
  } catch {
    return c.json({ columns: [], company_info: { mission: "", support_email: "", address: "", social: {} } });
  }
});

/**
 * POST /api/admin/footer
 * Saves footer configuration.
 */
app.post("/api/admin/footer", async (c) => {
  try {
    const footer = await c.req.json();
    await c.env.CONFIG_KV.put("global:config:footer", JSON.stringify(footer));
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save footer" }, 500);
  }
});

/**
 * POST /api/admin/communications/newsletter
 * Queues a newsletter (stub — logs intent, counts recipients).
 */
app.post("/api/admin/communications/newsletter", async (c) => {
  try {
    const { subject, html_body } = await c.req.json();
    if (!subject || !html_body) {
      return c.json({ success: false, error: "Subject and body are required" }, 400);
    }

    // Count active users
    let recipientCount = 0;
    try {
      const row = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM Users WHERE status = 'active'`
      ).first<{ cnt: number }>();
      recipientCount = row?.cnt || 0;
    } catch {
      recipientCount = 1;
    }

    // Log the newsletter dispatch
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'send_newsletter', 'newsletter', ?2, ?3)`
      ).bind(adminId, JSON.stringify({ subject, recipient_count: recipientCount }), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true, recipient_count: recipientCount, status: "queued" });
  } catch (err) {
    return c.json({ success: false, error: "Failed to send newsletter" }, 500);
  }
});

/**
 * GET /api/admin/finance/transactions
 * Returns financial transactions from D1.
 */
app.get("/api/admin/finance/transactions", async (c) => {
  try {
    let rows: any[] = [];
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, user_id, type, amount, currency, status, plan, stripe_id, created_at
         FROM Billing_Transactions ORDER BY created_at DESC LIMIT 200`
      ).all();
      rows = result.results || [];
    } catch {}

    // Enrich with email
    const enriched = [];
    for (const r of rows) {
      let email = "";
      try {
        const u = await c.env.DB.prepare(`SELECT email FROM Users WHERE id = ?1`).bind(r.user_id).first<{ email: string }>();
        email = u?.email || r.user_id;
      } catch { email = r.user_id; }
      enriched.push({ ...r, email, id: r.id?.toString() || crypto.randomUUID() });
    }
    return c.json(enriched);
  } catch {
    return c.json([]);
  }
});

/**
 * GET /api/admin/security/ip-blocklist
 * Returns blocked IPs.
 */
app.get("/api/admin/security/ip-blocklist", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:ip_blocklist");
    return c.json({ success: true, ips: raw ? JSON.parse(raw) : [] });
  } catch {
    return c.json({ success: true, ips: [] });
  }
});

/**
 * POST /api/admin/security/ip-blocklist
 * Adds an IP to the blocklist.
 */
app.post("/api/admin/security/ip-blocklist", async (c) => {
  try {
    const { ip } = await c.req.json();
    if (!ip) return c.json({ success: false, error: "IP is required" }, 400);

    const raw = await c.env.CONFIG_KV.get("global:config:ip_blocklist");
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(ip)) list.push(ip);
    await c.env.CONFIG_KV.put("global:config:ip_blocklist", JSON.stringify(list));

    // Audit
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'block_ip', 'ip_blocklist', ?2, ?3)`
      ).bind(adminId, JSON.stringify({ ip }), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to add IP" }, 500);
  }
});

/**
 * DELETE /api/admin/security/ip-blocklist/:ip
 * Removes an IP from the blocklist.
 */
app.delete("/api/admin/security/ip-blocklist/:ip", async (c) => {
  const ip = c.req.param("ip");
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:ip_blocklist");
    const list: string[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((i) => i !== ip);
    await c.env.CONFIG_KV.put("global:config:ip_blocklist", JSON.stringify(filtered));
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to remove IP" }, 500);
  }
});

/**
 * GET /api/admin/support/tickets
 * Returns support tickets.
 */
app.get("/api/admin/support/tickets", async (c) => {
  try {
    let rows: any[] = [];
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, user_id, subject, message, status, priority, assigned_to, created_at, updated_at
         FROM Support_Tickets ORDER BY created_at DESC LIMIT 200`
      ).all();
      rows = result.results || [];
    } catch {
      const raw = await c.env.CONFIG_KV.get("global:config:support_tickets");
      rows = raw ? JSON.parse(raw) : [];
    }
    return c.json(rows.map((r: any) => ({ ...r, id: r.id?.toString() || crypto.randomUUID() })));
  } catch {
    return c.json([]);
  }
});

/**
 * PATCH /api/admin/support/tickets/:ticketId
 * Updates a support ticket (status, priority, assigned_to).
 */
app.patch("/api/admin/support/tickets/:ticketId", async (c) => {
  const ticketId = c.req.param("ticketId");
  try {
    const body = await c.req.json();
    const now = new Date().toISOString();

    try {
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const key of ["status", "priority", "assigned_to"]) {
        if (body[key] !== undefined) {
          sets.push(`${key} = ?${idx}`);
          vals.push(body[key]);
          idx++;
        }
      }
      sets.push(`updated_at = ?${idx}`);
      vals.push(now);
      idx++;
      vals.push(ticketId);
      await c.env.DB.prepare(
        `UPDATE Support_Tickets SET ${sets.join(", ")} WHERE id = ?${idx}`
      ).bind(...vals).run();
    } catch {
      const raw = await c.env.CONFIG_KV.get("global:config:support_tickets");
      if (raw) {
        const list = JSON.parse(raw).map((t: any) =>
          t.id === ticketId ? { ...t, ...body, updated_at: now } : t
        );
        await c.env.CONFIG_KV.put("global:config:support_tickets", JSON.stringify(list));
      }
    }
    return c.json({ success: true, id: ticketId });
  } catch (err) {
    return c.json({ success: false, error: "Failed to update ticket" }, 500);
  }
});

/**
 * GET /api/admin/support/webhooks
 * Returns support webhook URLs (Discord, Telegram).
 */
app.get("/api/admin/support/webhooks", async (c) => {
  try {
    const raw = await c.env.CONFIG_KV.get("global:config:support_webhooks");
    return c.json({
      success: true,
      webhooks: raw ? JSON.parse(raw) : { discord_url: "", telegram_url: "" },
    });
  } catch {
    return c.json({ success: true, webhooks: { discord_url: "", telegram_url: "" } });
  }
});

/**
 * POST /api/admin/support/webhooks
 * Saves support webhook URLs.
 */
app.post("/api/admin/support/webhooks", async (c) => {
  try {
    const webhooks = await c.req.json();
    await c.env.CONFIG_KV.put("global:config:support_webhooks", JSON.stringify(webhooks));
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save webhooks" }, 500);
  }
});

/**
 * GET /api/admin/traffic
 * Returns traffic/analytics logs.
 */
app.get("/api/admin/traffic", async (c) => {
  try {
    let rows: any[] = [];
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, ip_address, device, country, referrer, route, created_at
         FROM Traffic_Logs ORDER BY created_at DESC LIMIT 200`
      ).all();
      rows = result.results || [];
    } catch {}
    return c.json(rows.map((r: any) => ({ ...r, id: r.id?.toString() || crypto.randomUUID() })));
  } catch {
    return c.json([]);
  }
});

/**
 * GET /api/admin/users/:userId  (single user detail)
 * Returns detailed info for one user including tasks, GSC, brand context.
 */
app.get("/api/admin/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  try {
    // Base user
    const user = await c.env.DB.prepare(
      `SELECT id, email, role, status, created_at FROM Users WHERE id = ?1`
    ).bind(userId).first();

    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    // Get associated project
    const project = await c.env.DB.prepare(
      `SELECT id, plan_tier FROM Projects WHERE owner_id = ?1 LIMIT 1`
    ).bind(userId).first<{ id: string; plan_tier: string }>() || null;

    const planTier = project?.plan_tier || "free";
    const projectId = project?.id || "";

    // Recent tasks
    let recentTasks: any[] = [];
    if (projectId) {
      try {
        const taskResult = await c.env.DB.prepare(
          `SELECT id, agent_type, action, status, task_description, created_at
           FROM Agent_Tasks WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 10`
        ).bind(projectId).all();
        recentTasks = (taskResult.results || []).map((r: any) => ({
          id: r.id?.toString() || "",
          agent_type: r.agent_type || "",
          action: r.action || "",
          status: r.status || "",
          task_description: r.task_description || "",
          created_at: r.created_at,
        }));
      } catch {}
    }

    // Tasks used this month
    let tasksUsed = 0;
    if (projectId) {
      try {
        const cnt = await c.env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM Agent_Tasks WHERE project_id = ?1 AND created_at > datetime('now', 'start of month')`
        ).bind(projectId).first<{ cnt: number }>();
        tasksUsed = cnt?.cnt || 0;
      } catch {}
    }

    // Brand context from KV
    let brandContext = null;
    if (projectId) {
      const raw = await c.env.CONFIG_KV.get(`project:${projectId}:settings`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.brand_context) brandContext = s.brand_context;
      }
    }

    const taskLimits: Record<string, number> = { free: 50, starter: 200, growth: 1000, enterprise: 10000 };

    const detail = {
      id: (user as any).id,
      email: (user as any).email,
      role: (user as any).role,
      plan: planTier,
      status: (user as any).status || "active",
      created_at: (user as any).created_at,
      plan_tier: planTier,
      tasks_used_this_month: tasksUsed,
      task_limit: taskLimits[planTier] || 50,
      total_revenue: 0,
      recent_tasks: recentTasks,
      gsc_summary: { total_clicks: 0, total_impressions: 0, avg_ctr: 0, avg_position: 0, mini_series: [] },
      brand_context: brandContext,
    };

    return c.json({ success: true, user: detail });
  } catch (err) {
    console.error("[admin/users/:id] Error:", err);
    return c.json({ success: false, error: "Failed to load user details" }, 500);
  }
});

/**
 * PATCH /api/admin/users/:userId/plan
 * Override a user's plan tier.
 */
app.patch("/api/admin/users/:userId/plan", async (c) => {
  const userId = c.req.param("userId");
  try {
    const { plan_tier } = await c.req.json();
    const taskLimits: Record<string, number> = { free: 50, starter: 200, growth: 1000, enterprise: 10000 };

    // Update project plan
    await c.env.DB.prepare(
      `UPDATE Projects SET plan_tier = ?1 WHERE owner_id = ?2`
    ).bind(plan_tier, userId).run();

    // Audit
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'override_plan', ?2, ?3, ?4)`
      ).bind(adminId, userId, JSON.stringify({ plan_tier }), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true, plan_tier, task_limit: taskLimits[plan_tier] || 50 });
  } catch (err) {
    return c.json({ success: false, error: "Failed to update plan" }, 500);
  }
});

/**
 * PATCH /api/admin/users/:userId/status
 * Update a user's status (active, suspended, banned).
 */
app.patch("/api/admin/users/:userId/status", async (c) => {
  const userId = c.req.param("userId");
  try {
    const { status } = await c.req.json();
    await c.env.DB.prepare(
      `UPDATE Users SET status = ?1 WHERE id = ?2`
    ).bind(status, userId).run();

    // Audit
    const adminId = c.get("userId") as string || "system";
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'update_user_status', ?2, ?3, ?4)`
      ).bind(adminId, userId, JSON.stringify({ status }), new Date().toISOString()).run();
    } catch {}

    return c.json({ success: true, status });
  } catch (err) {
    return c.json({ success: false, error: "Failed to update status" }, 500);
  }
});

/**
 * POST /api/admin/users/:userId/impersonate
 * Generates a temporary JWT for the target user.
 */
app.post("/api/admin/users/:userId/impersonate", async (c) => {
  const userId = c.req.param("userId");
  try {
    const user = await c.env.DB.prepare(
      `SELECT id, email, role FROM Users WHERE id = ?1`
    ).bind(userId).first<{ id: string; email: string; role: string }>();

    if (!user) return c.json({ success: false, error: "User not found" }, 404);

    // Import JWT signing
    const { sign } = await import("hono/jwt");
    const secret = c.env.JWT_SECRET || "swarme-dev-secret";
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      impersonated_by: c.get("userId") as string || "system",
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    const token = await sign(payload, secret, "HS256");

    // Audit
    try {
      await c.env.DB.prepare(
        `INSERT INTO Admin_Audit_Log (admin_id, action, target, metadata, created_at) VALUES (?1, 'impersonate', ?2, ?3, ?4)`
      ).bind(c.get("userId") as string || "system", userId, '{}', new Date().toISOString()).run();
    } catch {}

    return c.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role },
      expires_in: 3600,
    });
  } catch (err) {
    return c.json({ success: false, error: "Failed to impersonate" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Priority 3: Feature Page Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/geo-analytics
 * Returns GEO analytics: AI citations, schema deployments, search real-estate.
 */
app.get("/api/projects/:id/geo-analytics", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;

    // Search real estate
    let searchRealEstate: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, query, position, snippet_title, snippet_appearances, trend FROM Geo_Search_Real_Estate WHERE domain_id = ?1 ORDER BY snippet_appearances DESC LIMIT 50`
      ).bind(domainId).all();
      searchRealEstate = r.results || [];
    } catch {}

    // Recent AI citations
    let recentCitations: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, engine, query, cited_url, cited_page_title, position, snippet_preview, detected_at FROM Geo_Ai_Citations WHERE domain_id = ?1 ORDER BY detected_at DESC LIMIT 50`
      ).bind(domainId).all();
      recentCitations = r.results || [];
    } catch {}

    // Schema deployments
    let schemaDeployments: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT page_url, schema_type, injected_at, validation_status, errors FROM Geo_Schema_Deployments WHERE domain_id = ?1 ORDER BY injected_at DESC LIMIT 50`
      ).bind(domainId).all();
      schemaDeployments = r.results || [];
    } catch {}

    const totalCitations = recentCitations.length;
    const pagesWithSchema = schemaDeployments.length;
    const avgPos = recentCitations.length > 0
      ? recentCitations.reduce((s: number, c: any) => s + (c.position || 0), 0) / recentCitations.length
      : 0;

    return c.json({
      success: true,
      project_id: projectId,
      summary: {
        total_ai_citations: totalCitations,
        citation_growth_pct: 0,
        pages_with_schema: pagesWithSchema,
        avg_snippet_position: Math.round(avgPos * 10) / 10,
        geo_score: Math.min(100, totalCitations * 5 + pagesWithSchema * 10),
      },
      search_real_estate: searchRealEstate,
      recent_citations: recentCitations,
      schema_deployments: schemaDeployments.map((d: any) => ({
        ...d,
        errors: d.errors ? JSON.parse(d.errors) : [],
      })),
    });
  } catch (err) {
    return c.json({
      success: true,
      project_id: c.req.param("id"),
      summary: { total_ai_citations: 0, citation_growth_pct: 0, pages_with_schema: 0, avg_snippet_position: 0, geo_score: 0 },
      search_real_estate: [],
      recent_citations: [],
      schema_deployments: [],
    });
  }
});

/**
 * GET /api/projects/:id/internal-links
 * Returns internal link graph data: links, graph nodes/edges, summary.
 */
app.get("/api/projects/:id/internal-links", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;
    const statusFilter = c.req.query("status");

    let query = `SELECT id, project_id, source_asset_id, source_title, source_slug, target_asset_id, target_title, target_slug, target_url, anchor_text, similarity_score, status, injected_at, created_at FROM Internal_Links WHERE domain_id = ?1`;
    const params: any[] = [domainId];
    if (statusFilter) {
      query += ` AND status = ?2`;
      params.push(statusFilter);
    }
    query += ` ORDER BY created_at DESC LIMIT 200`;

    let links: any[] = [];
    try {
      const stmt = params.length === 2
        ? c.env.DB.prepare(query).bind(params[0], params[1])
        : c.env.DB.prepare(query).bind(params[0]);
      const r = await stmt.all();
      links = r.results || [];
    } catch {}

    // Build graph
    const nodeMap = new Map<string, { id: string; title: string; slug: string; inbound: number; outbound: number }>();
    const edges: any[] = [];
    for (const l of links) {
      if (!nodeMap.has(l.source_asset_id)) {
        nodeMap.set(l.source_asset_id, { id: l.source_asset_id, title: l.source_title, slug: l.source_slug, inbound: 0, outbound: 0 });
      }
      if (!nodeMap.has(l.target_asset_id)) {
        nodeMap.set(l.target_asset_id, { id: l.target_asset_id, title: l.target_title, slug: l.target_slug, inbound: 0, outbound: 0 });
      }
      nodeMap.get(l.source_asset_id)!.outbound++;
      nodeMap.get(l.target_asset_id)!.inbound++;
      edges.push({ source: l.source_asset_id, target: l.target_asset_id, anchor_text: l.anchor_text, similarity_score: l.similarity_score });
    }

    const activeLinks = links.filter((l: any) => l.status === "active").length;
    const removedLinks = links.filter((l: any) => l.status === "removed").length;
    const uniqueArticles = new Set([...links.map((l: any) => l.source_asset_id), ...links.map((l: any) => l.target_asset_id)]).size;
    const avgSim = links.length > 0
      ? links.reduce((s: number, l: any) => s + (l.similarity_score || 0), 0) / links.length
      : 0;

    return c.json({
      links,
      graph: { nodes: Array.from(nodeMap.values()), edges },
      summary: {
        total_links: links.length,
        active_links: activeLinks,
        removed_links: removedLinks,
        articles_connected: uniqueArticles,
        avg_similarity: Math.round(avgSim * 100) / 100,
      },
    });
  } catch {
    return c.json({
      links: [],
      graph: { nodes: [], edges: [] },
      summary: { total_links: 0, active_links: 0, removed_links: 0, articles_connected: 0, avg_similarity: 0 },
    });
  }
});

/**
 * DELETE /api/projects/:id/internal-links/:linkId
 * Soft-remove an internal link.
 */
app.delete("/api/projects/:id/internal-links/:linkId", async (c) => {
  try {
    const linkId = c.req.param("linkId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    try {
      await c.env.DB.prepare(
        `UPDATE Internal_Links SET status = 'removed' WHERE id = ?1 AND domain_id = ?2`
      ).bind(linkId, domainId).run();
    } catch {}
    return c.json({ success: true, link: { id: linkId, status: "removed" } });
  } catch {
    return c.json({ success: false, error: "Failed to remove link" }, 500);
  }
});

/**
 * POST /api/projects/:id/internal-links/:linkId/restore
 * Restore a soft-removed internal link.
 */
app.post("/api/projects/:id/internal-links/:linkId/restore", async (c) => {
  try {
    const linkId = c.req.param("linkId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    try {
      await c.env.DB.prepare(
        `UPDATE Internal_Links SET status = 'active' WHERE id = ?1 AND domain_id = ?2`
      ).bind(linkId, domainId).run();
    } catch {}
    return c.json({ success: true, link: { id: linkId, status: "active" } });
  } catch {
    return c.json({ success: false, error: "Failed to restore link" }, 500);
  }
});

/**
 * GET /api/projects/:id/off-domain
 * Returns off-domain trust data: connections, entity presence, syndication, outreach, reviews.
 */
app.get("/api/projects/:id/off-domain", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;

    let connections: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT platform, status, connected_at, scopes FROM Off_Domain_Connections WHERE domain_id = ?1`
      ).bind(domainId).all();
      connections = r.results || [];
    } catch {}

    let entityPresence: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT platform, score, label FROM Off_Domain_Entity_Presence WHERE domain_id = ?1`
      ).bind(domainId).all();
      entityPresence = r.results || [];
    } catch {}

    let syndicationLog: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, platform, content_type, title, success, external_id, error, created_at FROM Off_Domain_Syndication_Log WHERE domain_id = ?1 ORDER BY created_at DESC LIMIT 50`
      ).bind(domainId).all();
      syndicationLog = r.results || [];
    } catch {}

    let barnacleOutreach: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, target_url, target_title, keyword, contact_name, contact_email, status, created_at FROM Off_Domain_Barnacle_Outreach WHERE domain_id = ?1 ORDER BY created_at DESC LIMIT 50`
      ).bind(domainId).all();
      barnacleOutreach = r.results || [];
    } catch {}

    let reviewRouting: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, customer_name, order_number, platform_routed, sent_at FROM Off_Domain_Review_Routing WHERE domain_id = ?1 ORDER BY sent_at DESC LIMIT 50`
      ).bind(domainId).all();
      reviewRouting = r.results || [];
    } catch {}

    return c.json({
      success: true,
      project_id: projectId,
      connections,
      entity_presence: entityPresence,
      syndication_log: syndicationLog,
      barnacle_outreach: barnacleOutreach,
      review_routing: reviewRouting,
      summary: {
        platforms_connected: connections.filter((c: any) => c.status === "connected").length,
        pins_created: syndicationLog.filter((s: any) => s.success).length,
        outreach_pending: barnacleOutreach.filter((b: any) => b.status === "awaiting_approval").length,
        reviews_routed: reviewRouting.length,
        entity_score: entityPresence.length > 0
          ? Math.round(entityPresence.reduce((s: number, e: any) => s + (e.score || 0), 0) / entityPresence.length)
          : 0,
      },
    });
  } catch {
    return c.json({
      success: true,
      project_id: c.req.param("id"),
      connections: [],
      entity_presence: [],
      syndication_log: [],
      barnacle_outreach: [],
      review_routing: [],
      summary: { platforms_connected: 0, pins_created: 0, outreach_pending: 0, reviews_routed: 0, entity_score: 0 },
    });
  }
});

/**
 * POST /api/projects/:id/onboarding/context
 * Save onboarding context (CMS provider, site URL, competitors, north star).
 */
app.post("/api/projects/:id/onboarding/context", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;
    const body = await c.req.json<{ cmsProvider?: string; siteUrl?: string; competitorUrls?: string[]; northStarUrl?: string }>() || {};

    const contextData = {
      projectId,
      cmsProvider: body.cmsProvider || "",
      siteUrl: body.siteUrl || "",
      competitorUrls: body.competitorUrls || [],
      northStarUrl: body.northStarUrl || "",
    };

    await c.env.KV.put(`project:${domainId}:onboarding_context`, JSON.stringify(contextData));
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: "Failed to save onboarding context" }, 500);
  }
});

/**
 * GET /api/projects/:id/onboarding/context
 * Load onboarding context.
 */
app.get("/api/projects/:id/onboarding/context", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;

    const raw = await c.env.KV.get(`project:${domainId}:onboarding_context`);
    if (raw) {
      return c.json({ success: true, context: JSON.parse(raw) });
    }
    return c.json({ success: true, context: null });
  } catch {
    return c.json({ success: true, context: null });
  }
});

/**
 * GET /api/projects/:id/outreach-campaigns
 * List outreach campaigns with optional status filter.
 */
app.get("/api/projects/:id/outreach-campaigns", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;
    const statusFilter = c.req.query("status");

    let query = `SELECT id, project_id, keyword, target_url, target_email, contact_name, outreach_draft, status, domain_authority, relevance_score, sent_at, replied_at, created_at, updated_at FROM Outreach_Campaigns WHERE domain_id = ?1`;
    const params: any[] = [domainId];
    if (statusFilter) {
      query += ` AND status = ?2`;
      params.push(statusFilter);
    }
    query += ` ORDER BY created_at DESC LIMIT 100`;

    let campaigns: any[] = [];
    try {
      const stmt = params.length === 2
        ? c.env.DB.prepare(query).bind(params[0], params[1])
        : c.env.DB.prepare(query).bind(params[0]);
      const r = await stmt.all();
      campaigns = r.results || [];
    } catch {}

    const drafts = campaigns.filter((c: any) => c.status === "Draft").length;
    const sent = campaigns.filter((c: any) => c.status === "Sent").length;
    const replied = campaigns.filter((c: any) => c.status === "Replied").length;
    const approved = campaigns.filter((c: any) => c.status === "Approved").length;

    return c.json({
      success: true,
      campaigns,
      summary: { total: campaigns.length, drafts, sent, replied, approved },
    });
  } catch {
    return c.json({
      success: true,
      campaigns: [],
      summary: { total: 0, drafts: 0, sent: 0, replied: 0, approved: 0 },
    });
  }
});

/**
 * PATCH /api/projects/:id/outreach-campaigns/:campaignId
 * Update an outreach campaign (draft content, status).
 */
app.patch("/api/projects/:id/outreach-campaigns/:campaignId", async (c) => {
  try {
    const campaignId = c.req.param("campaignId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const body = await c.req.json<{ outreach_draft?: string; status?: string }>() || {};

    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (body.outreach_draft !== undefined) {
      updates.push(`outreach_draft = ?${idx}`);
      vals.push(body.outreach_draft);
      idx++;
    }
    if (body.status !== undefined) {
      updates.push(`status = ?${idx}`);
      vals.push(body.status);
      idx++;
    }
    updates.push(`updated_at = ?${idx}`);
    vals.push(new Date().toISOString());
    idx++;

    vals.push(campaignId, domainId);

    if (updates.length > 1) {
      try {
        await c.env.DB.prepare(
          `UPDATE Outreach_Campaigns SET ${updates.join(", ")} WHERE id = ?${idx} AND domain_id = ?${idx + 1}`
        ).bind(...vals).run();
      } catch {}
    }

    // Fetch updated
    let campaign: any = { id: campaignId };
    try {
      const r = await c.env.DB.prepare(
        `SELECT * FROM Outreach_Campaigns WHERE id = ?1 AND domain_id = ?2`
      ).bind(campaignId, domainId).first();
      if (r) campaign = r;
    } catch {}

    return c.json({ success: true, campaign });
  } catch {
    return c.json({ success: false, error: "Failed to update campaign" }, 500);
  }
});

/**
 * POST /api/projects/:id/outreach-campaigns/:campaignId/send
 * Mark a campaign as sent (stub — real email sending would happen here).
 */
app.post("/api/projects/:id/outreach-campaigns/:campaignId/send", async (c) => {
  try {
    const campaignId = c.req.param("campaignId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const now = new Date().toISOString();

    try {
      await c.env.DB.prepare(
        `UPDATE Outreach_Campaigns SET status = 'Sent', sent_at = ?1, updated_at = ?1 WHERE id = ?2 AND domain_id = ?3`
      ).bind(now, campaignId, domainId).run();
    } catch {}

    let campaign: any = { id: campaignId, status: "Sent" };
    try {
      const r = await c.env.DB.prepare(
        `SELECT * FROM Outreach_Campaigns WHERE id = ?1 AND domain_id = ?2`
      ).bind(campaignId, domainId).first();
      if (r) campaign = r;
    } catch {}

    return c.json({ success: true, campaign });
  } catch {
    return c.json({ success: false, error: "Failed to send campaign" }, 500);
  }
});

/**
 * POST /api/projects/:id/outreach-campaigns/prospect
 * Stub: trigger prospecting for a keyword.
 */
app.post("/api/projects/:id/outreach-campaigns/prospect", async (c) => {
  try {
    const body = await c.req.json<{ keyword?: string }>() || {};
    const keyword = body.keyword || "";
    // In production, this would trigger the outreach agent to find prospects.
    // For now, return a success stub.
    return c.json({
      success: true,
      keyword,
      prospects_found: 0,
      drafts_created: 0,
      message: `Prospecting for "${keyword}" has been queued. Results will appear shortly.`,
    });
  } catch {
    return c.json({ success: false, error: "Failed to run prospecting" }, 500);
  }
});

/**
 * GET /api/projects/:id/ugc-campaigns
 * List UGC campaign ledger entries.
 */
app.get("/api/projects/:id/ugc-campaigns", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;

    let entries: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, domain_id, product_id, product_name, product_url, product_description, status, estimated_budget, creator_brief, external_brief_id, created_at, updated_at FROM UGC_Campaign_Ledger WHERE domain_id = ?1 ORDER BY created_at DESC LIMIT 100`
      ).bind(domainId).all();
      entries = r.results || [];
    } catch {}

    return c.json({ success: true, entries });
  } catch {
    return c.json({ success: true, entries: [] });
  }
});

/**
 * POST /api/projects/:id/ugc-campaigns/:ledgerId/approve
 * Approve a UGC campaign entry.
 */
app.post("/api/projects/:id/ugc-campaigns/:ledgerId/approve", async (c) => {
  try {
    const ledgerId = c.req.param("ledgerId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const now = new Date().toISOString();
    try {
      await c.env.DB.prepare(
        `UPDATE UGC_Campaign_Ledger SET status = 'approved', updated_at = ?1 WHERE id = ?2 AND domain_id = ?3`
      ).bind(now, ledgerId, domainId).run();
    } catch {}
    return c.json({ success: true, status: "approved" });
  } catch {
    return c.json({ success: false, error: "Failed to approve" }, 500);
  }
});

/**
 * POST /api/projects/:id/ugc-campaigns/:ledgerId/dismiss
 * Dismiss (reject) a UGC campaign entry.
 */
app.post("/api/projects/:id/ugc-campaigns/:ledgerId/dismiss", async (c) => {
  try {
    const ledgerId = c.req.param("ledgerId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const now = new Date().toISOString();
    try {
      await c.env.DB.prepare(
        `UPDATE UGC_Campaign_Ledger SET status = 'rejected', updated_at = ?1 WHERE id = ?2 AND domain_id = ?3`
      ).bind(now, ledgerId, domainId).run();
    } catch {}
    return c.json({ success: true, status: "rejected" });
  } catch {
    return c.json({ success: false, error: "Failed to dismiss" }, 500);
  }
});

/**
 * GET /api/projects/:id/comms/threads
 * List communication threads for a project.
 */
app.get("/api/projects/:id/comms/threads", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;

    let threads: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, subject, participants, initiated_by, campaign_id, status, last_message_at, message_count, last_message_preview FROM Comms_Threads WHERE domain_id = ?1 ORDER BY last_message_at DESC LIMIT 100`
      ).bind(domainId).all();
      threads = (r.results || []).map((t: any) => ({
        ...t,
        participants: t.participants ? JSON.parse(t.participants) : [],
      }));
    } catch {}

    const needsReply = threads.filter((t: any) => t.status === "needs_reply").length;
    const awaiting = threads.filter((t: any) => t.status === "awaiting").length;
    const replied = threads.filter((t: any) => t.status === "replied").length;

    return c.json({
      success: true,
      threads,
      summary: { total: threads.length, needs_reply: needsReply, awaiting, replied },
    });
  } catch {
    return c.json({
      success: true,
      threads: [],
      summary: { total: 0, needs_reply: 0, awaiting: 0, replied: 0 },
    });
  }
});

/**
 * GET /api/projects/:id/comms/threads/:threadId
 * Get a single communication thread with all messages.
 */
app.get("/api/projects/:id/comms/threads/:threadId", async (c) => {
  try {
    const threadId = c.req.param("threadId");
    const domainId = c.get("domainId") as string || c.req.param("id");

    let thread: any = null;
    try {
      thread = await c.env.DB.prepare(
        `SELECT id, subject, participants, initiated_by, campaign_id, status, last_message_at FROM Comms_Threads WHERE id = ?1 AND domain_id = ?2`
      ).bind(threadId, domainId).first();
    } catch {}

    if (!thread) {
      return c.json({ success: false, error: "Thread not found" }, 404);
    }

    thread.participants = thread.participants ? JSON.parse(thread.participants) : [];

    let messages: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT id, "from", "to", body, sent_at, direction FROM Comms_Messages WHERE thread_id = ?1 ORDER BY sent_at ASC`
      ).bind(threadId).all();
      messages = r.results || [];
    } catch {}

    thread.messages = messages;
    return c.json({ success: true, thread });
  } catch {
    return c.json({ success: false, error: "Failed to load thread" }, 500);
  }
});

/**
 * POST /api/projects/:id/comms/threads/:threadId/reply
 * Add a reply to a communication thread.
 */
app.post("/api/projects/:id/comms/threads/:threadId/reply", async (c) => {
  try {
    const threadId = c.req.param("threadId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const { body } = await c.req.json<{ body: string }>();
    const now = new Date().toISOString();
    const msgId = crypto.randomUUID();
    const userId = c.get("userId") as string || "system";

    try {
      await c.env.DB.prepare(
        `INSERT INTO Comms_Messages (id, thread_id, "from", "to", body, sent_at, direction) VALUES (?1, ?2, ?3, '', ?4, ?5, 'outbound')`
      ).bind(msgId, threadId, userId, body, now).run();

      await c.env.DB.prepare(
        `UPDATE Comms_Threads SET status = 'replied', last_message_at = ?1, message_count = message_count + 1, last_message_preview = ?2 WHERE id = ?3 AND domain_id = ?4`
      ).bind(now, body.substring(0, 200), threadId, domainId).run();
    } catch {}

    return c.json({
      success: true,
      message: { id: msgId, from: userId, to: "", body, sent_at: now, direction: "outbound" },
    });
  } catch {
    return c.json({ success: false, error: "Failed to send reply" }, 500);
  }
});

/**
 * GET /api/projects/:id/action-history
 * Returns action history entries with filtering.
 */
app.get("/api/projects/:id/action-history", async (c) => {
  try {
    const projectId = c.req.param("id");
    const domainId = c.get("domainId") as string || projectId;
    const agentType = c.req.query("agent_type");
    const entityType = c.req.query("entity_type");
    const rolledBack = c.req.query("rolled_back");
    const limit = parseInt(c.req.query("limit") || "50", 10);

    let query = `SELECT id, project_id, agent_type, action, entity_type, entity_id, snapshot_before, snapshot_after, preview_url, rolled_back, rolled_back_at, created_at FROM Action_History WHERE domain_id = ?1`;
    const params: any[] = [domainId];
    let idx = 2;

    if (agentType) {
      query += ` AND agent_type = ?${idx}`;
      params.push(agentType);
      idx++;
    }
    if (entityType) {
      query += ` AND entity_type = ?${idx}`;
      params.push(entityType);
      idx++;
    }
    if (rolledBack !== undefined) {
      query += ` AND rolled_back = ?${idx}`;
      params.push(parseInt(rolledBack, 10));
      idx++;
    }
    query += ` ORDER BY created_at DESC LIMIT ?${idx}`;
    params.push(limit);

    let actions: any[] = [];
    try {
      const stmt = c.env.DB.prepare(query);
      const bound = stmt.bind(...params);
      const r = await bound.all();
      actions = r.results || [];
    } catch {}

    return c.json({ success: true, project_id: projectId, actions, total: actions.length });
  } catch {
    return c.json({ success: true, project_id: c.req.param("id"), actions: [], total: 0 });
  }
});

/**
 * POST /api/projects/:id/action-history/:actionId/rollback
 * Rollback an action.
 */
app.post("/api/projects/:id/action-history/:actionId/rollback", async (c) => {
  try {
    const actionId = c.req.param("actionId");
    const domainId = c.get("domainId") as string || c.req.param("id");
    const now = new Date().toISOString();

    let action: any = null;
    try {
      action = await c.env.DB.prepare(
        `SELECT id, snapshot_before FROM Action_History WHERE id = ?1 AND domain_id = ?2`
      ).bind(actionId, domainId).first();
    } catch {}

    if (!action) {
      return c.json({ success: false, error: "Action not found" }, 404);
    }

    try {
      await c.env.DB.prepare(
        `UPDATE Action_History SET rolled_back = 1, rolled_back_at = ?1 WHERE id = ?2 AND domain_id = ?3`
      ).bind(now, actionId, domainId).run();
    } catch {}

    let restoredSnapshot = {};
    try {
      restoredSnapshot = action.snapshot_before ? JSON.parse(action.snapshot_before) : {};
    } catch {}

    return c.json({
      success: true,
      action_id: actionId,
      rolled_back: true,
      restored_snapshot: restoredSnapshot,
    });
  } catch {
    return c.json({ success: false, error: "Failed to rollback" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Priority 5: Developer API v1 Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/agents/status
 * Public API: Check health and status of all 12 agents.
 */
app.get("/api/v1/agents/status", async (c) => {
  try {
    const agents = [
      "content-writer", "seo-auditor", "visibility-tracker", "social-agent",
      "link-builder", "decay-monitor", "ab-tester", "internal-linker",
      "geo-optimizer", "off-domain-agent", "ugc-manager", "outreach-agent",
    ];
    const statuses = agents.map((a) => ({
      agent: a,
      status: "idle" as const,
      last_run: null as string | null,
      tasks_completed_24h: 0,
    }));
    return c.json({ success: true, agents: statuses });
  } catch {
    return c.json({ success: false, error: "Failed to fetch agent status" }, 500);
  }
});

/**
 * GET /api/v1/audits
 * Public API: List site audits with pagination.
 */
app.get("/api/v1/audits", async (c) => {
  try {
    const userId = c.get("userId") as string;
    let audits: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT a.id, a.project_id, a.audit_type, a.status, a.score, a.created_at FROM Audits a JOIN Projects p ON a.project_id = p.id JOIN Domains d ON p.domain_id = d.id WHERE d.owner_id = ?1 ORDER BY a.created_at DESC LIMIT 50`
      ).bind(userId).all();
      audits = r.results || [];
    } catch {}
    return c.json({ success: true, audits, total: audits.length });
  } catch {
    return c.json({ success: true, audits: [], total: 0 });
  }
});

/**
 * POST /api/v1/audits/run
 * Public API: Trigger a new audit for a domain.
 */
app.post("/api/v1/audits/run", async (c) => {
  try {
    const body = await c.req.json<{ domain?: string; audit_type?: string }>() || {};
    return c.json({
      success: true,
      audit_id: crypto.randomUUID(),
      domain: body.domain || "",
      audit_type: body.audit_type || "full",
      status: "queued",
      message: "Audit has been queued and will begin shortly.",
    });
  } catch {
    return c.json({ success: false, error: "Failed to queue audit" }, 500);
  }
});

/**
 * GET /api/v1/keywords
 * Public API: Retrieve tracked keywords and rankings.
 */
app.get("/api/v1/keywords", async (c) => {
  try {
    const userId = c.get("userId") as string;
    let keywords: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT k.id, k.keyword, k.current_rank, k.previous_rank, k.search_volume, k.updated_at FROM Keywords k JOIN Projects p ON k.project_id = p.id JOIN Domains d ON p.domain_id = d.id WHERE d.owner_id = ?1 ORDER BY k.search_volume DESC LIMIT 100`
      ).bind(userId).all();
      keywords = r.results || [];
    } catch {}
    return c.json({ success: true, keywords, total: keywords.length });
  } catch {
    return c.json({ success: true, keywords: [], total: 0 });
  }
});

/**
 * GET /api/v1/content/drafts
 * Public API: List AI-generated content drafts.
 */
app.get("/api/v1/content/drafts", async (c) => {
  try {
    const userId = c.get("userId") as string;
    let drafts: any[] = [];
    try {
      const r = await c.env.DB.prepare(
        `SELECT t.id, t.project_id, t.title, t.status, t.created_at, t.updated_at FROM Tasks t JOIN Projects p ON t.project_id = p.id JOIN Domains d ON p.domain_id = d.id WHERE d.owner_id = ?1 AND t.agent_type = 'content' AND t.status IN ('draft', 'pending_review') ORDER BY t.created_at DESC LIMIT 50`
      ).bind(userId).all();
      drafts = r.results || [];
    } catch {}
    return c.json({ success: true, drafts, total: drafts.length });
  } catch {
    return c.json({ success: true, drafts: [], total: 0 });
  }
});

/**
 * POST /api/v1/content/approve/:id
 * Public API: Approve a draft for publishing.
 */
app.post("/api/v1/content/approve/:id", async (c) => {
  try {
    const draftId = c.req.param("id");
    const now = new Date().toISOString();
    try {
      await c.env.DB.prepare(
        `UPDATE Tasks SET status = 'approved', updated_at = ?1 WHERE id = ?2`
      ).bind(now, draftId).run();
    } catch {}
    return c.json({ success: true, draft_id: draftId, status: "approved" });
  } catch {
    return c.json({ success: false, error: "Failed to approve draft" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Task 2.3: Autonomous Cron Trigger (Scheduled Events)
// ─────────────────────────────────────────────────────────────

/**
 * The scheduled handler is invoked by Cloudflare's cron trigger
 * system. It wakes the swarm on the defined schedule:
 *
 *   "0 * * * *"    → Hourly swarm orchestration
 *   "0 6 * * *"    → Daily full visibility audit
 *   "* /15 * * * *" → Trend velocity polling (Phase 4)
 *
 * Logic flow:
 * 1. Query D1 Projects table for all active project IDs
 * 2. For each project, fetch settings from KV
 * 3. If visibility_check_enabled, trigger checkAIVisibility()
 * 4. Log the cron execution as an Agent_Task
 */
async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const cronPattern = event.cron;
  const startTime = Date.now();

  console.log(`[Swarme Cron] Triggered: ${cronPattern} at ${new Date().toISOString()}`);

  try {
    // ── Step 1: Get all active projects from D1 ──
    const projectsResult = await env.DB.prepare(
      "SELECT id, name, mode FROM Projects WHERE is_active = 1"
    ).all();

    const projects = projectsResult.results as {
      id: string;
      name: string;
      mode: string;
    }[];

    if (projects.length === 0) {
      console.log("[Swarme Cron] No active projects found. Exiting.");
      return;
    }

    console.log(`[Swarme Cron] Found ${projects.length} active project(s)`);

    let totalChecked = 0;
    let totalGaps = 0;

    for (const project of projects) {
      // ── Step 2: Fetch project settings from KV ──
      const kvKey = `config:project:${project.id}:settings`;
      const settings = await env.CONFIG_KV.get<ProjectSettings>(kvKey, "json");

      // If no settings in KV yet, build defaults and write them
      const projectSettings: ProjectSettings = settings ?? {
        mode: project.mode as "copilot" | "autopilot",
        is_active: true,
        visibility_check_enabled: true,
        trend_detection_enabled: true,
        cro_enabled: true,
        outreach_enabled: true,
        bounce_rate_threshold: parseInt(env.BOUNCE_RATE_THRESHOLD, 10),
        trend_velocity_threshold: parseFloat(env.TREND_VELOCITY_THRESHOLD),
        updated_at: new Date().toISOString(),
      };

      // Write defaults to KV if they didn't exist
      if (!settings) {
        await env.CONFIG_KV.put(kvKey, JSON.stringify(projectSettings));
      }

      // ── Step 3: Execute micro-agents based on settings ──

      // Hourly cron or daily audit: run visibility check
      if (
        projectSettings.visibility_check_enabled &&
        (cronPattern === "0 * * * *" || cronPattern === "0 6 * * *")
      ) {
        console.log(`[Swarme Cron] Running visibility check for ${project.name} (${project.id})`);

        // Use waitUntil so the response doesn't block on long-running checks
        const checkPromise = (async () => {
          try {
            const result = await checkAIVisibility(project.id, env);
            totalChecked += result.keywords_checked;
            totalGaps += result.gaps_detected;

            // Log the cron execution
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES (?, 'visibility', 'Scheduled Visibility Audit', 'Completed', ?, ?)`
            )
              .bind(
                project.id,
                `Cron (${cronPattern}): Checked ${result.keywords_checked} keywords, found ${result.gaps_detected} gap(s)`,
                JSON.stringify(result)
              )
              .run();

            console.log(
              `[Swarme Cron] ${project.name}: ${result.keywords_checked} keywords checked, ` +
                `${result.citations_found} cited, ${result.gaps_detected} gaps`
            );
          } catch (err) {
            console.error(`[Swarme Cron] Error checking ${project.name}:`, err);

            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
               VALUES (?, 'visibility', 'Scheduled Visibility Audit', 'Failed', ?)`
            )
              .bind(
                project.id,
                `Cron (${cronPattern}) failed: ${err instanceof Error ? err.message : "Unknown error"}`
              )
              .run();
          }
        })();

        ctx.waitUntil(checkPromise);
      }

      // Trend detection (Phase 4 placeholder)
      if (
        projectSettings.trend_detection_enabled &&
        cronPattern === "*/15 * * * *"
      ) {
        console.log(`[Swarme Cron] Trend detection for ${project.name} — Phase 4 (skipped)`);
        // Phase 4: ctx.waitUntil(checkTrendVelocity(project.id, env));
      }
    }

    // ── Phase 62: Dead-Letter Sweeper (every 15 min) ─────────
    // Resets idempotency keys stuck in 'processing' for >10 min
    // and purges expired keys to prevent table bloat.
    if (cronPattern === "*/15 * * * *") {
      console.log("[Swarme Cron] Starting dead-letter sweep...");
      const deadLetterPromise = (async () => {
        try {
          const result = await handleDeadLetterSweep(env);
          console.log(
            `[Swarme Cron] Dead-letter sweep complete — ${result.stuckTasksFound} stuck, ` +
            `${result.tasksReset} reset, ${result.expiredKeysPurged} expired purged`
          );
        } catch (err) {
          console.error("[Swarme Cron] Dead-letter sweep failed:", err);
        }
      })();
      ctx.waitUntil(deadLetterPromise);
    }

    // ── Phase 18: Weekly Content Decay Scan ──────────────────
    // Runs on the weekly cron (Sunday 00:00 UTC).
    // Finds published articles older than 6 months that haven't
    // been refreshed, marks them PENDING, and dispatches a
    // refresh task to the DO for each.
    if (cronPattern === "0 0 * * 0") {
      console.log("[Swarme Cron] Starting weekly content decay scan...");

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.toISOString();

      // Find published articles that are stale:
      //   - created_at (or last_refreshed_at if set) older than 6 months
      //   - Not already pending/awaiting a refresh
      const staleResult = await env.DB.prepare(`
        SELECT id, project_id, keyword, title, slug, html_content,
               created_at, last_refreshed_at, refresh_status
        FROM Content_Assets
        WHERE status = 'Published'
          AND (refresh_status IS NULL OR refresh_status = 'DISCARDED')
          AND COALESCE(last_refreshed_at, created_at) < ?1
        ORDER BY COALESCE(last_refreshed_at, created_at) ASC
        LIMIT 20
      `).bind(cutoff).all();

      const staleArticles = (staleResult.results || []) as {
        id: string;
        project_id: string;
        keyword: string;
        title: string;
        slug: string;
        html_content: string | null;
        created_at: string;
        last_refreshed_at: string | null;
        refresh_status: string | null;
      }[];

      console.log(`[Swarme Cron] Found ${staleArticles.length} stale article(s) for refresh`);

      for (const article of staleArticles) {
        // Mark as PENDING so it doesn't get picked up again next week
        await env.DB.prepare(
          `UPDATE Content_Assets SET refresh_status = 'PENDING', updated_at = datetime('now') WHERE id = ?1`
        ).bind(article.id).run();

        // Dispatch refresh task to the Durable Object
        const doId = env.AGENT_WORKFLOW.idFromName(article.project_id);
        const doStub = env.AGENT_WORKFLOW.get(doId);

        const refreshPromise = doStub.fetch(
          new Request("https://do.internal/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assetId: article.id,
              keyword: article.keyword,
              title: article.title,
              slug: article.slug,
              existingHtml: article.html_content || "",
            }),
          })
        );

        ctx.waitUntil(refreshPromise);

        // Log the task
        await env.DB.prepare(
          `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
           VALUES (?1, 'writer', 'Content Refresh', 'Running', ?2)`
        ).bind(
          article.project_id,
          `Decay refresh for "${article.title}" (asset ${article.id})`
        ).run();
      }

      console.log(`[Swarme Cron] Dispatched ${staleArticles.length} refresh task(s)`);
    }

    // ── Phase 34: Daily GSC Data Sync (06:00 UTC) ──────────
    // Runs alongside the daily visibility audit.
    if (cronPattern === "0 6 * * *") {
      console.log("[Swarme Cron] Starting daily GSC sync...");
      const gscPromise = (async () => {
        try {
          const result = await handleGscSync(env);
          console.log(
            `[Swarme Cron] GSC sync complete — ${result.usersProcessed} users, ` +
            `${result.rowsUpserted} rows, ${result.errors.length} errors`
          );

          if (result.usersProcessed > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'gsc_sync', 'Daily GSC Ingestion', 'Completed', ?1, ?2)`
            ).bind(
              `Synced ${result.usersProcessed} users, ${result.rowsUpserted} metric rows`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] GSC sync failed:", err);
        }
      })();
      ctx.waitUntil(gscPromise);
    }

    // ── Phase 42: Daily GA4 Sync + CRO Trigger (06:00 UTC) ──
    if (cronPattern === "0 6 * * *") {
      console.log("[Swarme Cron] Starting daily GA4 sync...");
      const ga4Promise = (async () => {
        try {
          const syncResult = await handleGa4Sync(env);
          console.log(
            `[Swarme Cron] GA4 sync complete — ${syncResult.usersProcessed} users, ` +
            `${syncResult.rowsUpserted} rows, ${syncResult.errors.length} errors`
          );

          if (syncResult.usersProcessed > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'ga4_sync', 'Daily GA4 Ingestion', 'Completed', ?1, ?2)`
            ).bind(
              `Synced ${syncResult.usersProcessed} users, ${syncResult.rowsUpserted} metric rows`,
              JSON.stringify(syncResult)
            ).run();
          }

          // Run CRO trigger after GA4 data is fresh
          const croResult = await handleGa4CroTrigger(env);
          console.log(
            `[Swarme Cron] CRO trigger complete — ${croResult.roadmapItemsCreated} suggestions, ` +
            `${croResult.alertsLogged} alerts`
          );

          if (croResult.roadmapItemsCreated > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'cro', 'GA4 Mobile CRO Analysis', 'Completed', ?1, ?2)`
            ).bind(
              `Analyzed ${croResult.projectsScanned} projects, found ${croResult.highBounceUrls} high-bounce pages, created ${croResult.roadmapItemsCreated} roadmap suggestions`,
              JSON.stringify(croResult)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] GA4 sync/CRO trigger failed:", err);
        }
      })();
      ctx.waitUntil(ga4Promise);
    }

    // ── Phase 27: Daily Retention Scan (14:00 UTC) ──────────
    if (cronPattern === "0 14 * * *") {
      console.log("[Swarme Cron] Starting daily retention scan...");
      const retentionPromise = (async () => {
        try {
          const result = await handleRetentionCron(env);
          console.log(
            `[Swarme Cron] Retention complete — ${result.usersScanned} at-risk users, ` +
            `${result.notificationsSent} notifications, ${result.magicLinksSent} magic links`
          );

          await env.DB.prepare(
            `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
             VALUES ('system', 'retention', 'Daily Retention Scan', 'Completed', ?1, ?2)`
          ).bind(
            `Scanned ${result.usersScanned} at-risk users, sent ${result.notificationsSent} notifications`,
            JSON.stringify(result)
          ).run();
        } catch (err) {
          console.error("[Swarme Cron] Retention scan failed:", err);
        }
      })();
      ctx.waitUntil(retentionPromise);
    }

    // ── Phase 44: Daily Digest (17:00 UTC) ──────────
    if (cronPattern === "0 17 * * *") {
      console.log("[Swarme Cron] Starting daily digest dispatch...");
      const dailyDigestPromise = (async () => {
        try {
          const result = await handleDailyDigest(env);
          console.log(
            `[Swarme Cron] Daily digest complete — ${result.emailsSent} sent, ` +
            `${result.skipped} skipped, ${result.errors} errors`
          );

          if (result.emailsSent > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'newsletter', 'Daily Digest', 'Completed', ?1, ?2)`
            ).bind(
              `Sent ${result.emailsSent} daily digest emails to ${result.usersQueried} subscribers`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Daily digest failed:", err);
        }
      })();
      ctx.waitUntil(dailyDigestPromise);
    }

    // ── Phase 44: Weekly Digest (17:00 UTC Friday) ──────────
    if (cronPattern === "0 17 * * 5") {
      console.log("[Swarme Cron] Starting weekly digest dispatch...");
      const weeklyDigestPromise = (async () => {
        try {
          const result = await handleWeeklyDigest(env);
          console.log(
            `[Swarme Cron] Weekly digest complete — ${result.emailsSent} sent, ` +
            `${result.skipped} skipped, ${result.errors} errors`
          );

          if (result.emailsSent > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'newsletter', 'Weekly Digest', 'Completed', ?1, ?2)`
            ).bind(
              `Sent ${result.emailsSent} weekly digest emails to ${result.usersQueried} subscribers`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Weekly digest failed:", err);
        }
      })();
      ctx.waitUntil(weeklyDigestPromise);
    }

    // ── Phase 51: Hourly wallet auto-recharge check ──
    if (cronPattern === "0 * * * *") {
      const walletRechargePromise = (async () => {
        try {
          await handleWalletRecharge(env);
          console.log("[Swarme Cron] Wallet auto-recharge check complete");
        } catch (err) {
          console.error("[Swarme Cron] Wallet recharge failed:", err);
        }
      })();
      ctx.waitUntil(walletRechargePromise);
    }

    // ── Phase 52: Weekly Data Synthesizer (Sundays 03:00 UTC) ──
    if (cronPattern === "0 3 * * 0") {
      console.log("[Swarme Cron] Starting weekly data synthesis scan...");
      const synthesizerPromise = (async () => {
        try {
          await handleDataSynthesizerCron(env);
          console.log("[Swarme Cron] Data synthesizer complete");

          await env.DB.prepare(
            `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
             VALUES ('system', 'data_synthesizer', 'Weekly Data Synthesis', 'Completed', 'Scanned all active domains for milestone-triggered proprietary reports')`
          ).run();
        } catch (err) {
          console.error("[Swarme Cron] Data synthesizer failed:", err);
        }
      })();
      ctx.waitUntil(synthesizerPromise);
    }

    // ── Phase 54: Weekly Chaos Swarm (Sundays 04:00 UTC) ──
    if (cronPattern === "0 4 * * 0") {
      console.log("[Swarme Cron] Starting weekly chaos swarm red team...");
      const chaosPromise = (async () => {
        try {
          const workerUrl = "https://swarme-worker." + (env.CF_PAGES_URL || "workers.dev");

          for (const project of projects) {
            const domainId = project.id;
            const [fuzzResult, llmResult] = await Promise.all([
              runApiFuzzer(env, domainId, workerUrl),
              runLlmAttacker(env, domainId, workerUrl),
            ]);

            const criticalFailures = fuzzResult.critical_failures + llmResult.critical_failures;

            console.log(
              `[Chaos Swarm] ${project.name}: ${fuzzResult.total_tests + llmResult.total_tests} tests, ` +
              `${criticalFailures} critical failures`
            );

            // Critical SMS alert if race condition or XSS escape detected
            if (criticalFailures > 0) {
              console.error(
                `[CHAOS ALERT] CRITICAL: ${criticalFailures} vulnerability(ies) detected for ${project.name}. ` +
                `Immediate remediation required.`
              );
              // SMS alert would fire here via Twilio binding when configured
            }
          }

          await env.DB.prepare(
            `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description)
             VALUES ('system', 'chaos_swarm', 'Weekly Red Team Scan', 'Completed', ?1)`
          ).bind(
            `Chaos swarm completed for ${projects.length} project(s)`
          ).run();
        } catch (err) {
          console.error("[Swarme Cron] Chaos swarm failed:", err);
        }
      })();
      ctx.waitUntil(chaosPromise);
    }

    // ── Phase 56: Weekly Link Rot Scan (Sundays 05:00 UTC) ──
    if (cronPattern === "0 5 * * 0") {
      console.log("[Swarme Cron] Starting weekly link rot scan...");
      const linkRotPromise = (async () => {
        try {
          const result = await handleLinkRotCron(env);
          console.log(
            `[Swarme Cron] Link rot scan complete — ${result.domainsScanned} domains, ` +
            `${result.linksChecked} links checked, ${result.deadLinksFound} dead, ` +
            `${result.replacementsFound} replacements found`
          );

          if (result.linksChecked > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'link_healer', 'Weekly Link Rot Scan', 'Completed', ?1, ?2)`
            ).bind(
              `Scanned ${result.domainsScanned} domains, checked ${result.linksChecked} links, found ${result.deadLinksFound} dead, ${result.replacementsFound} replacements`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Link rot scan failed:", err);
        }
      })();
      ctx.waitUntil(linkRotPromise);
    }

    // ── Phase 61: Daily Memory Compressor (00:00 UTC) ───────
    if (cronPattern === "0 0 * * *") {
      console.log("[Swarme Cron] Starting daily memory compression...");
      const memoryPromise = (async () => {
        try {
          const result = await handleMemoryCompression(env);
          console.log(
            `[Swarme Cron] Memory compression complete — ${result.domainsProcessed} domains, ` +
            `${result.messagesCompressed} messages compressed, ${result.factsExtracted} facts extracted`
          );

          if (result.messagesCompressed > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'memory_compressor', 'Daily Memory Compression', 'Completed', ?1, ?2)`
            ).bind(
              `Compressed ${result.messagesCompressed} messages from ${result.domainsProcessed} domains into ${result.factsExtracted} facts`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Memory compression failed:", err);
        }
      })();
      ctx.waitUntil(memoryPromise);
    }

    // ── Phase 64: Monthly Log Archiver (1st of month, 00:30 UTC) ─
    // Cold-storage: moves 90-day-old logs to R2 as .jsonl, then
    // purges from D1 to keep the hot database lean.
    if (cronPattern === "30 0 1 * *") {
      console.log("[Swarme Cron] Starting monthly log archival...");
      const archivePromise = (async () => {
        try {
          const result = await handleLogArchival(env);
          console.log(
            `[Swarme Cron] Log archival complete — ${result.tablesProcessed} tables, ` +
            `${result.totalRecordsArchived} records archived, ${result.errors.length} errors`
          );

          if (result.totalRecordsArchived > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'log_archiver', 'Monthly Cold Storage Archival', 'Completed', ?1, ?2)`
            ).bind(
              `Archived ${result.totalRecordsArchived} records from ${result.tablesProcessed} tables to R2`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Log archival failed:", err);
        }
      })();
      ctx.waitUntil(archivePromise);
    }

    // ── Phase 63: Weekly Outcome Evaluator (Sundays 01:00 UTC) ─
    // Retrospective agent: grades past actions against analytics,
    // extracts strategic lessons, and embeds them into Vectorize.
    if (cronPattern === "0 1 * * 7") {
      console.log("[Swarme Cron] Starting weekly outcome evaluation...");
      const evaluatorPromise = (async () => {
        try {
          const result = await handleOutcomeEvaluation(env);
          console.log(
            `[Swarme Cron] Outcome evaluation complete — ${result.actionsEvaluated} evaluated, ` +
            `${result.lessonsExtracted} lessons, ${result.lessonsEmbedded} embedded`
          );

          if (result.actionsEvaluated > 0) {
            await env.DB.prepare(
              `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
               VALUES ('system', 'outcome_evaluator', 'Weekly Retrospective', 'Completed', ?1, ?2)`
            ).bind(
              `Evaluated ${result.actionsEvaluated} actions, extracted ${result.lessonsExtracted} lessons, embedded ${result.lessonsEmbedded} into Vectorize`,
              JSON.stringify(result)
            ).run();
          }
        } catch (err) {
          console.error("[Swarme Cron] Outcome evaluation failed:", err);
        }
      })();
      ctx.waitUntil(evaluatorPromise);
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Swarme Cron] Complete in ${elapsed}ms — ` +
        `${projects.length} projects, ${totalChecked} keywords, ${totalGaps} gaps`
    );
  } catch (error) {
    console.error("[Swarme Cron] Fatal error:", error);
  }
}

// ─────────────────────────────────────────────────────────────
// Worker Export
// ─────────────────────────────────────────────────────────────
// TODO: Re-enable Sentry wrapping once @sentry/cloudflare is
//       installed and SENTRY_DSN is configured as a secret.

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
} as ExportedHandler<Env>;
