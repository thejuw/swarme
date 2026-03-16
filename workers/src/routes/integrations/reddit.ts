/**
 * ============================================================
 * Phase 49: Reddit OAuth 2.0 Flow
 * ============================================================
 *
 * GET  /auth      — Generates Reddit OAuth URL, redirects user
 * GET  /callback  — Exchanges auth code for tokens, saves to
 *                   Credentials_Vault linked to domain_id
 *
 * Scopes: submit, identity
 *
 * Required env secrets:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

export const redditRouter = new Hono<{ Bindings: Env }>();

// ── Constants ────────────────────────────────────────────────

const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/authorize";
const REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_SCOPES = "submit identity";
const REDDIT_DURATION = "permanent"; // Request refresh_token

function getCallbackUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/api/reddit/callback`;
}

// ─────────────────────────────────────────────────────────────
// GET /auth — Initiate Reddit OAuth
// ─────────────────────────────────────────────────────────────

redditRouter.get("/auth", async (c) => {
  const clientId = c.env.REDDIT_CLIENT_ID;
  if (!clientId) {
    return c.json({ success: false, error: "Reddit OAuth not configured" }, 503);
  }

  const jwtPayload = c.get("jwtPayload") as
    | { sub: string; email: string; domain_id?: string }
    | undefined;

  if (!jwtPayload?.sub) {
    return c.json({ success: false, error: "Authentication required" }, 401);
  }

  const callbackUrl = getCallbackUrl(c.req.url);
  const statePayload = `${jwtPayload.sub}:${jwtPayload.domain_id || "default"}`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    state: statePayload,
    redirect_uri: callbackUrl,
    duration: REDDIT_DURATION,
    scope: REDDIT_SCOPES,
  });

  const authUrl = `${REDDIT_AUTH_URL}?${params.toString()}`;
  return c.redirect(authUrl, 302);
});

// ─────────────────────────────────────────────────────────────
// GET /callback — Handle Reddit OAuth callback
// ─────────────────────────────────────────────────────────────

redditRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    console.error(`[Reddit OAuth] Authorization denied: ${error}`);
    return c.redirect("/#/off-domain?reddit=error&reason=" + encodeURIComponent(error), 302);
  }

  if (!code || !state) {
    return c.redirect("/#/off-domain?reddit=error&reason=missing_params", 302);
  }

  const clientId = c.env.REDDIT_CLIENT_ID;
  const clientSecret = c.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect("/#/off-domain?reddit=error&reason=not_configured", 302);
  }

  const [userId, domainId] = state.split(":");
  if (!userId) {
    return c.redirect("/#/off-domain?reddit=error&reason=invalid_state", 302);
  }

  const callbackUrl = getCallbackUrl(c.req.url);

  try {
    // ── Reddit uses HTTP Basic Auth for token exchange ──
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch(REDDIT_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
        "User-Agent": "Swarme/1.0 (by /u/SwarmeBot)",
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
      message?: string;
    };

    if (!tokenRes.ok || tokenData.error) {
      console.error(`[Reddit OAuth] Token exchange failed: ${tokenData.message || tokenData.error}`);
      return c.redirect(
        "/#/off-domain?reddit=error&reason=" + encodeURIComponent(tokenData.message || "token_exchange_failed"),
        302,
      );
    }

    if (!tokenData.access_token) {
      return c.redirect("/#/off-domain?reddit=error&reason=no_access_token", 302);
    }

    // ── Store tokens in Credentials_Vault ──
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await c.env.DB.prepare(
      `INSERT INTO Credentials_Vault (domain_id, platform, access_token, refresh_token, scopes, expires_at, created_at, updated_at)
       VALUES (?, 'reddit', ?, ?, ?, ?, datetime('now'), datetime('now'))
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
        tokenData.scope || REDDIT_SCOPES,
        expiresAt,
      )
      .run();

    console.log(`[Reddit OAuth] Tokens saved for domain ${domainId}`);
    return c.redirect("/#/off-domain?reddit=connected", 302);

  } catch (err) {
    console.error("[Reddit OAuth] Unexpected error:", err);
    return c.redirect("/#/off-domain?reddit=error&reason=internal_error", 302);
  }
});
