/**
 * ============================================================
 * Phase 42: Google Analytics 4 — OAuth + Data API Integration
 * ============================================================
 *
 * GET    /auth       — Initiates Google OAuth with GA4 scope
 * GET    /callback   — Exchanges auth code, stores refresh token
 * GET    /status     — Returns GA4 connection status
 * DELETE /disconnect — Removes GA4 connection
 * GET    /metrics    — Returns cached GA4 metrics for a project
 *
 * OAuth scopes requested:
 *   analytics.readonly — read-only access to GA4 properties
 *
 * The companion cron (cron/ga4Sync.ts) uses the refresh token
 * to pull data from the GA4 Data API (runReport) daily.
 *
 * All Google API calls use raw fetch() — no Node.js SDK deps,
 * fully edge-compatible on Cloudflare Workers.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

export const ga4Router = new Hono<{ Bindings: Env }>();

// ── Constants ────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Phase 42 expands the OAuth scope from Phase 34.
 * We request both GSC and GA4 scopes so a single consent screen
 * grants access to both services. include_granted_scopes=true
 * ensures existing GSC tokens are preserved.
 */
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/**
 * Build the OAuth callback URL dynamically from the request origin.
 */
function getCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/ga4/callback`;
}

// ─────────────────────────────────────────────────────────────
// GET /auth — Initiate Google OAuth with GA4 scope
// ─────────────────────────────────────────────────────────────

ga4Router.get("/auth", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ success: false, error: "Google OAuth not configured" }, 503);
  }

  const jwtPayload = c.get("jwtPayload") as
    | { sub: string; email: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: GA4_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: jwtPayload.sub,
    include_granted_scopes: "true",
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  // If the request has Accept: application/json, return the URL as JSON
  // (used by the frontend SPA). Otherwise redirect (used by direct browser nav).
  const accept = c.req.header("accept") || "";
  if (accept.includes("application/json")) {
    return c.json({ success: true, auth_url: authUrl });
  }
  return c.redirect(authUrl, 302);
});

// ─────────────────────────────────────────────────────────────
// GET /callback — Handle Google OAuth callback
// ─────────────────────────────────────────────────────────────

ga4Router.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    console.error(`[GA4 OAuth] Authorization denied: ${error}`);
    return c.redirect("/#/settings?ga4=error&reason=" + encodeURIComponent(error), 302);
  }

  if (!code || !state) {
    return c.redirect("/#/settings?ga4=error&reason=missing_params", 302);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect("/#/settings?ga4=error&reason=not_configured", 302);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  try {
    // ── Exchange authorization code for tokens ──
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokenData.error) {
      console.error(`[GA4 OAuth] Token exchange failed: ${tokenData.error_description || tokenData.error}`);
      return c.redirect(
        "/#/settings?ga4=error&reason=" + encodeURIComponent(tokenData.error_description || "token_exchange_failed"),
        302,
      );
    }

    if (!tokenData.refresh_token) {
      console.error("[GA4 OAuth] No refresh_token received — user may need to revoke and re-auth");
      return c.redirect("/#/settings?ga4=error&reason=no_refresh_token", 302);
    }

    // ── Auto-detect GA4 property via Admin API ──
    let propertyId = "";
    try {
      const accountsRes = await fetch(
        "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );

      if (accountsRes.ok) {
        const accountsData = (await accountsRes.json()) as {
          accountSummaries?: Array<{
            account: string;
            displayName: string;
            propertySummaries?: Array<{
              property: string;
              displayName: string;
            }>;
          }>;
        };

        // Pick the first GA4 property
        const firstProperty = accountsData.accountSummaries
          ?.[0]?.propertySummaries?.[0]?.property;

        if (firstProperty) {
          // property is like "properties/123456789" — extract the numeric ID
          propertyId = firstProperty.replace("properties/", "");
        }
      }
    } catch (adminErr) {
      console.warn("[GA4 OAuth] Admin API lookup failed — user can set property manually:", adminErr);
    }

    // ── Persist to D1 ──
    const userId = state;
    await c.env.DB.prepare(
      `UPDATE Users
       SET ga4_refresh_token = ?,
           ga4_property_id = ?
       WHERE id = ?`,
    )
      .bind(tokenData.refresh_token, propertyId, userId)
      .run();

    console.log(`[GA4 OAuth] User ${userId} connected — property: ${propertyId || "(none detected)"}`);

    return c.redirect(
      `/#/settings?ga4=connected&property=${encodeURIComponent(propertyId)}`,
      302,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[GA4 OAuth] Callback error: ${msg}`);
    return c.redirect("/#/settings?ga4=error&reason=" + encodeURIComponent(msg), 302);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /status — Check if user has GA4 connected
// ─────────────────────────────────────────────────────────────

ga4Router.get("/status", async (c) => {
  const jwtPayload = c.get("jwtPayload") as
    | { sub: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const user = await c.env.DB.prepare(
    "SELECT ga4_refresh_token, ga4_property_id FROM Users WHERE id = ?",
  )
    .bind(jwtPayload.sub)
    .first<{ ga4_refresh_token: string | null; ga4_property_id: string | null }>();

  return c.json({
    success: true,
    connected: !!user?.ga4_refresh_token,
    property_id: user?.ga4_property_id || null,
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /disconnect — Remove GA4 connection
// ─────────────────────────────────────────────────────────────

ga4Router.delete("/disconnect", async (c) => {
  const jwtPayload = c.get("jwtPayload") as
    | { sub: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  await c.env.DB.prepare(
    `UPDATE Users
     SET ga4_refresh_token = NULL,
         ga4_property_id = NULL
     WHERE id = ?`,
  )
    .bind(jwtPayload.sub)
    .run();

  console.log(`[GA4 OAuth] User ${jwtPayload.sub} disconnected GA4`);
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// GET /metrics — Return cached GA4 metrics for a project
// ─────────────────────────────────────────────────────────────

ga4Router.get("/metrics", async (c) => {
  const projectId = c.req.query("project_id");
  if (!projectId) {
    return c.json({ success: false, error: "project_id required" }, 400);
  }

  try {
    const rows = await c.env.DB.prepare(
      `SELECT page_path, device_category, date, sessions, bounce_rate,
              avg_session_duration, conversions, conversion_rate, country
       FROM GA4_Metrics
       WHERE project_id = ?
       ORDER BY date DESC
       LIMIT 500`,
    )
      .bind(projectId)
      .all();

    return c.json({ success: true, metrics: rows.results || [] });
  } catch (err) {
    console.error(`[GA4 Metrics] Error: ${err}`);
    return c.json({ success: false, error: "Failed to fetch GA4 metrics" }, 500);
  }
});
