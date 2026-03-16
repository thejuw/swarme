/**
 * ============================================================
 * Phase 49: Pinterest OAuth 2.0 Flow
 * ============================================================
 *
 * GET  /auth      — Generates Pinterest OAuth URL, redirects user
 * GET  /callback  — Exchanges auth code for tokens, saves to
 *                   Credentials_Vault linked to domain_id
 *
 * Scopes: boards:read, pins:read, pins:write
 *
 * Required env secrets:
 *   PINTEREST_APP_ID, PINTEREST_APP_SECRET
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

export const pinterestRouter = new Hono<{ Bindings: Env }>();

// ── Constants ────────────────────────────────────────────────

const PINTEREST_AUTH_URL = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const PINTEREST_SCOPES = "boards:read,pins:read,pins:write";

function getCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/pinterest/callback`;
}

// ─────────────────────────────────────────────────────────────
// GET /auth — Initiate Pinterest OAuth
// ─────────────────────────────────────────────────────────────

pinterestRouter.get("/auth", async (c) => {
  const appId = c.env.PINTEREST_APP_ID;
  if (!appId) {
    return c.json({ success: false, error: "Pinterest OAuth not configured" }, 503);
  }

  const jwtPayload = c.get("jwtPayload") as
    | { sub: string; email: string; domain_id?: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  // State encodes user_id:domain_id for the callback
  const statePayload = `${jwtPayload.sub}:${jwtPayload.domain_id || "default"}`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: PINTEREST_SCOPES,
    state: statePayload,
  });

  const authUrl = `${PINTEREST_AUTH_URL}?${params.toString()}`;
  return c.redirect(authUrl, 302);
});

// ─────────────────────────────────────────────────────────────
// GET /callback — Handle Pinterest OAuth callback
// ─────────────────────────────────────────────────────────────

pinterestRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    console.error(`[Pinterest OAuth] Authorization denied: ${error}`);
    return c.redirect("/#/off-domain?pinterest=error&reason=" + encodeURIComponent(error), 302);
  }

  if (!code || !state) {
    return c.redirect("/#/off-domain?pinterest=error&reason=missing_params", 302);
  }

  const appId = c.env.PINTEREST_APP_ID;
  const appSecret = c.env.PINTEREST_APP_SECRET;

  if (!appId || !appSecret) {
    return c.redirect("/#/off-domain?pinterest=error&reason=not_configured", 302);
  }

  // Parse state → user_id:domain_id
  const [userId, domainId] = state.split(":");
  if (!userId) {
    return c.redirect("/#/off-domain?pinterest=error&reason=invalid_state", 302);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  try {
    // ── Exchange authorization code for tokens ──
    const basicAuth = btoa(`${appId}:${appSecret}`);

    const tokenRes = await fetch(PINTEREST_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl,
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || tokenData.error) {
      console.error(`[Pinterest OAuth] Token exchange failed: ${tokenData.error_description || tokenData.error}`);
      return c.redirect(
        "/#/off-domain?pinterest=error&reason=" + encodeURIComponent(tokenData.error_description || "token_exchange_failed"),
        302,
      );
    }

    if (!tokenData.access_token) {
      return c.redirect("/#/off-domain?pinterest=error&reason=no_access_token", 302);
    }

    // ── Store tokens in Credentials_Vault ──
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await c.env.DB.prepare(
      `INSERT INTO Credentials_Vault (domain_id, platform, access_token, refresh_token, scopes, expires_at, created_at, updated_at)
       VALUES (?, 'pinterest', ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT (domain_id, platform) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         scopes = excluded.scopes,
         expires_at = excluded.expires_at,
         updated_at = datetime('now')`
    )
      .bind(
        domainId,
        tokenData.access_token,
        tokenData.refresh_token || null,
        tokenData.scope || PINTEREST_SCOPES,
        expiresAt,
      )
      .run();

    console.log(`[Pinterest OAuth] Tokens saved for domain ${domainId}`);
    return c.redirect("/#/off-domain?pinterest=connected", 302);

  } catch (err) {
    console.error("[Pinterest OAuth] Unexpected error:", err);
    return c.redirect("/#/off-domain?pinterest=error&reason=internal_error", 302);
  }
});
