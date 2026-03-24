/**
 * ============================================================
 * Phase 34: Google Search Console OAuth 2.0 Flow
 * ============================================================
 *
 * GET  /auth      — Generates Google OAuth URL, redirects user
 * GET  /callback  — Exchanges auth code for tokens, saves refresh
 *                   token to D1, redirects to dashboard
 *
 * All Google API calls use raw fetch() — no Node.js SDK deps,
 * fully edge-compatible on Cloudflare Workers.
 *
 * Required env secrets:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *
 * OAuth scopes requested:
 *   webmasters.readonly — read-only access to GSC properties
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

export const gscRouter = new Hono<{ Bindings: Env }>();

// ── Constants ────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_SCOPE = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/content",
].join(" ");

/**
 * Build the OAuth callback URL dynamically from the request origin.
 * In production this resolves to the worker's domain; locally to localhost.
 */
function getCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/gsc/callback`;
}

// ─────────────────────────────────────────────────────────────
// GET /auth — Initiate Google OAuth
// ─────────────────────────────────────────────────────────────

gscRouter.get("/auth", async (c) => {
  // Guard: Google credentials must be configured
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ success: false, error: "Google OAuth not configured" }, 503);
  }

  // Extract authenticated user from JWT (set by protectRoute middleware)
  const jwtPayload = c.get("jwtPayload") as
    | { sub: string; email: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  // Build the authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",       // Required to receive a refresh_token
    prompt: "consent",            // Force consent screen to always get refresh_token
    state: jwtPayload.sub,        // Pass user ID through the state param for callback
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

gscRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state"); // user ID from the auth step
  const error = c.req.query("error");

  // ── Handle user denial or Google error ──
  if (error) {
    console.error(`[GSC OAuth] Authorization denied: ${error}`);
    return c.redirect("/#/settings?gsc=error&reason=" + encodeURIComponent(error), 302);
  }

  if (!code || !state) {
    return c.redirect("/#/settings?gsc=error&reason=missing_params", 302);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect("/#/settings?gsc=error&reason=not_configured", 302);
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
      console.error(`[GSC OAuth] Token exchange failed: ${tokenData.error_description || tokenData.error}`);
      return c.redirect(
        "/#/settings?gsc=error&reason=" + encodeURIComponent(tokenData.error_description || "token_exchange_failed"),
        302,
      );
    }

    if (!tokenData.refresh_token) {
      console.error("[GSC OAuth] No refresh_token received — user may need to revoke and re-auth");
      return c.redirect("/#/settings?gsc=error&reason=no_refresh_token", 302);
    }

    // ── Fetch user's GSC properties to auto-detect their site ──
    const sitesRes = await fetch(
      "https://www.googleapis.com/webmasters/v3/sites",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    let propertyUrl = "";
    if (sitesRes.ok) {
      const sitesData = (await sitesRes.json()) as {
        siteEntry?: Array<{
          siteUrl: string;
          permissionLevel: string;
        }>;
      };

      // Pick the first verified property (owner or full permission)
      const owned = sitesData.siteEntry?.find(
        (s) => s.permissionLevel === "siteOwner" || s.permissionLevel === "siteFullUser",
      );
      propertyUrl = owned?.siteUrl || sitesData.siteEntry?.[0]?.siteUrl || "";
    }

    // ── Persist to D1 ──
    const userId = state; // user ID from the state param
    await c.env.DB.prepare(
      `UPDATE Users
       SET gsc_refresh_token = ?,
           gsc_property_url = ?
       WHERE id = ?`,
    )
      .bind(tokenData.refresh_token, propertyUrl, userId)
      .run();

    console.log(`[GSC OAuth] User ${userId} connected — property: ${propertyUrl || "(none detected)"}`);

    // Redirect back to settings with success
    return c.redirect(
      `/#/settings?gsc=connected&property=${encodeURIComponent(propertyUrl)}`,
      302,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[GSC OAuth] Callback error: ${msg}`);
    return c.redirect("/#/settings?gsc=error&reason=" + encodeURIComponent(msg), 302);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /status — Check if user has GSC connected
// ─────────────────────────────────────────────────────────────

gscRouter.get("/status", async (c) => {
  const jwtPayload = c.get("jwtPayload") as
    | { sub: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const user = await c.env.DB.prepare(
    "SELECT gsc_refresh_token, gsc_property_url FROM Users WHERE id = ?",
  )
    .bind(jwtPayload.sub)
    .first<{ gsc_refresh_token: string | null; gsc_property_url: string | null }>();

  return c.json({
    success: true,
    connected: !!user?.gsc_refresh_token,
    property_url: user?.gsc_property_url || null,
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /disconnect — Remove GSC connection
// ─────────────────────────────────────────────────────────────

gscRouter.delete("/disconnect", async (c) => {
  const jwtPayload = c.get("jwtPayload") as
    | { sub: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  await c.env.DB.prepare(
    `UPDATE Users
     SET gsc_refresh_token = NULL,
         gsc_property_url = NULL
     WHERE id = ?`,
  )
    .bind(jwtPayload.sub)
    .run();

  console.log(`[GSC OAuth] User ${jwtPayload.sub} disconnected GSC`);
  return c.json({ success: true });
});
