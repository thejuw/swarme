/**
 * auth.ts — Phase 19: Edge Authentication Module
 *
 * Provides JWT-based auth for the Swarme API using Cloudflare-compatible
 * WebCrypto (PBKDF2-SHA256) for password hashing and hono/jwt for tokens.
 *
 * Exports:
 *   - authRouter     — Hono sub-app with /api/auth/register + /api/auth/login
 *   - protectRoute   — Middleware that verifies Bearer JWT on protected routes
 *   - hashPassword   — PBKDF2-SHA256 hashing via WebCrypto
 *   - verifyPassword — Timing-safe password verification
 */

import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { verifyTurnstile } from "./utils/turnstile";
import type { Env } from "./index";

// ─────────────────────────────────────────────────────────────
// WebCrypto Password Hashing (PBKDF2-SHA256)
// ─────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert hex string to Uint8Array */
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Hash a plaintext password using PBKDF2-SHA256.
 * Returns "salt:hash" where both are hex-encoded.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8
  );

  return `${bufToHex(salt)}:${bufToHex(derivedBits)}`;
}

/**
 * Verify a plaintext password against a stored "salt:hash" string.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = hexToBuf(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8
  );

  const derived = bufToHex(derivedBits);

  // Timing-safe comparison
  if (derived.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ─────────────────────────────────────────────────────────────
// JWT Helpers
// ─────────────────────────────────────────────────────────────

/** JWT secret — in production use env.JWT_SECRET; falls back for dev */
function getJwtSecret(env: Env): string {
  return (env as any).JWT_SECRET || "swarme-dev-jwt-secret-change-in-prod";
}

/** Token lifetime: 7 days */
const TOKEN_TTL = 7 * 24 * 60 * 60;

/** Generate a signed JWT for a user */
async function generateToken(
  userId: string,
  email: string,
  env: Env
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      email,
      iat: now,
      exp: now + TOKEN_TTL,
    },
    getJwtSecret(env)
  );
}

// ─────────────────────────────────────────────────────────────
// Auth Router — /api/auth/*
// ─────────────────────────────────────────────────────────────

export const authRouter = new Hono<{ Bindings: Env }>();

/**
 * POST /api/auth/register
 * Body: { email, password }
 * Returns: { success, token, user: { id, email } }
 */
authRouter.post("/register", async (c) => {
  try {
    const { email, password, turnstileToken, referralId, accepted_terms } = await c.req.json<{
      email: string;
      password: string;
      turnstileToken?: string;
      referralId?: string;
      accepted_terms?: boolean;
    }>();

    if (!email || !password) {
      return c.json({ success: false, error: "Email and password are required" }, 400);
    }

    // Phase 28: Enforce terms acceptance
    if (!accepted_terms) {
      return c.json({ success: false, error: "You must accept the Terms of Service and Privacy Policy" }, 400);
    }

    if (password.length < 8) {
      return c.json({ success: false, error: "Password must be at least 8 characters" }, 400);
    }

    // Verify Turnstile token (graceful bypass if secret not configured)
    const clientIp = c.req.header("CF-Connecting-IP");
    const turnstileOk = await verifyTurnstile(turnstileToken, clientIp, c.env.TURNSTILE_SECRET_KEY);
    if (!turnstileOk) {
      return c.json({ success: false, error: "Bot verification failed" }, 403);
    }

    // Check if user already exists
    const existing = await c.env.DB.prepare(
      "SELECT id FROM Users WHERE email = ?1"
    )
      .bind(email.toLowerCase().trim())
      .first();

    if (existing) {
      return c.json({ success: false, error: "An account with this email already exists" }, 409);
    }

    // Hash password and insert
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);

    // Phase 28: Record terms acceptance timestamp
    const termsAcceptedAt = new Date().toISOString();

    await c.env.DB.prepare(
      "INSERT INTO Users (id, email, password_hash, terms_accepted_at) VALUES (?1, ?2, ?3, ?4)"
    )
      .bind(userId, email.toLowerCase().trim(), passwordHash, termsAcceptedAt)
      .run();

    // Generate JWT
    const token = await generateToken(userId, email.toLowerCase().trim(), c.env);

    // Phase 24: If a Rewardful referral ID was provided, store it alongside
    // the user record so downstream Stripe Customer creation can attach it
    // as metadata (client_reference_id / metadata.rewardful_referral).
    if (referralId) {
      try {
        await c.env.DB.prepare(
          "UPDATE Users SET referral_id = ?1 WHERE id = ?2"
        ).bind(referralId, userId).run();
      } catch (_) {
        // Non-critical — column may not exist yet; log and continue
        console.warn("[Auth] Could not store referral_id — column may not exist");
      }
    }

    return c.json({
      success: true,
      token,
      user: { id: userId, email: email.toLowerCase().trim(), role: "user" },
    });
  } catch (error: any) {
    console.error("[Auth] Register error:", error);
    return c.json({ success: false, error: "Registration failed" }, 500);
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { success, token, user: { id, email } }
 */
authRouter.post("/login", async (c) => {
  try {
    const { email, password, turnstileToken } = await c.req.json<{
      email: string;
      password: string;
      turnstileToken?: string;
    }>();

    if (!email || !password) {
      return c.json({ success: false, error: "Email and password are required" }, 400);
    }

    // Verify Turnstile token (graceful bypass if secret not configured)
    const clientIp = c.req.header("CF-Connecting-IP");
    const turnstileOk = await verifyTurnstile(turnstileToken, clientIp, c.env.TURNSTILE_SECRET_KEY);
    if (!turnstileOk) {
      return c.json({ success: false, error: "Bot verification failed" }, 403);
    }

    // Look up user (include role for frontend admin panel access)
    const user = await c.env.DB.prepare(
      "SELECT id, email, password_hash, role FROM Users WHERE email = ?1"
    )
      .bind(email.toLowerCase().trim())
      .first<{ id: string; email: string; password_hash: string; role: string }>();

    if (!user) {
      return c.json({ success: false, error: "Invalid email or password" }, 401);
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return c.json({ success: false, error: "Invalid email or password" }, 401);
    }

    // Generate JWT
    const token = await generateToken(user.id, user.email, c.env);

    // Phase 27: Stamp last_login_at for retention tracking
    try {
      await c.env.DB.prepare(
        "UPDATE Users SET last_login_at = datetime('now') WHERE id = ?1"
      ).bind(user.id).run();
    } catch (_) {
      // Non-critical — column may not exist yet in older migrations
      console.warn("[Auth] Could not update last_login_at");
    }

    return c.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, role: user.role || "user" },
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error);
    return c.json({ success: false, error: "Login failed" }, 500);
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user (requires valid JWT).
 */
authRouter.get("/me", async (c) => {
  // This route is protected by the middleware applied at the parent level
  const payload = (c as any).get("jwtPayload");
  if (!payload) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  return c.json({
    success: true,
    user: { id: payload.sub, email: payload.email },
  });
});

// ─────────────────────────────────────────────────────────────
// Phase 27: Magic Link Authentication
// ─────────────────────────────────────────────────────────────

/** Token lifetime for magic links: 15 minutes */
const MAGIC_LINK_TTL = 15 * 60;

/**
 * Generate a one-time magic link JWT for passwordless re-engagement.
 * Stores the link record in Magic_Links table.
 * Returns the full magic link URL.
 */
export async function createMagicLink(
  userId: string,
  email: string,
  env: Env
): Promise<{ token: string; url: string; expiresAt: string }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((now + MAGIC_LINK_TTL) * 1000).toISOString();

  const magicToken = await sign(
    {
      sub: userId,
      email,
      type: "magic_link",
      iat: now,
      exp: now + MAGIC_LINK_TTL,
    },
    getJwtSecret(env)
  );

  const linkId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);

  await env.DB.prepare(
    `INSERT INTO Magic_Links (id, user_id, token, expires_at)
     VALUES (?1, ?2, ?3, ?4)`
  ).bind(linkId, userId, magicToken, expiresAt).run();

  // In production, this would be the actual app domain
  const baseUrl = "https://swarme.io";
  const url = `${baseUrl}/#/magic-login/${magicToken}`;

  return { token: magicToken, url, expiresAt };
}

/**
 * POST /api/auth/magic-verify
 * Verifies a magic link token, marks it as used, issues a full session JWT.
 */
authRouter.post("/magic-verify", async (c) => {
  try {
    const { token: magicToken } = await c.req.json<{ token: string }>();

    if (!magicToken) {
      return c.json({ success: false, error: "Token is required" }, 400);
    }

    // Verify JWT signature and expiration
    let payload: any;
    try {
      payload = await verify(magicToken, getJwtSecret(c.env), "HS256");
    } catch {
      return c.json({ success: false, error: "Invalid or expired magic link" }, 401);
    }

    if (payload.type !== "magic_link") {
      return c.json({ success: false, error: "Invalid token type" }, 401);
    }

    // Check if token exists and hasn't been used
    const linkRow = await c.env.DB.prepare(
      "SELECT id, used_at FROM Magic_Links WHERE token = ?1"
    ).bind(magicToken).first<{ id: string; used_at: string | null }>();

    if (!linkRow) {
      return c.json({ success: false, error: "Magic link not found" }, 404);
    }

    if (linkRow.used_at) {
      return c.json({ success: false, error: "Magic link already used" }, 410);
    }

    // Mark as used (one-time)
    await c.env.DB.prepare(
      "UPDATE Magic_Links SET used_at = datetime('now') WHERE id = ?1"
    ).bind(linkRow.id).run();

    // Stamp last_login_at
    try {
      await c.env.DB.prepare(
        "UPDATE Users SET last_login_at = datetime('now') WHERE id = ?1"
      ).bind(payload.sub).run();
    } catch (_) {}

    // Log reactivation event
    try {
      const eventId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
      await c.env.DB.prepare(
        `INSERT INTO Retention_Events (id, user_id, event_type, channel, metadata)
         VALUES (?1, ?2, 'reactivated', 'magic_link', ?3)`
      ).bind(eventId, payload.sub, JSON.stringify({ method: "magic_link" })).run();
    } catch (_) {}

    // Generate full session JWT
    const sessionToken = await generateToken(payload.sub, payload.email, c.env);

    return c.json({
      success: true,
      token: sessionToken,
      user: { id: payload.sub, email: payload.email },
    });
  } catch (error: any) {
    console.error("[Auth] Magic verify error:", error);
    return c.json({ success: false, error: "Verification failed" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// JWT Middleware — protectRoute
// ─────────────────────────────────────────────────────────────

/**
 * Hono middleware that verifies the JWT from the Authorization header.
 * On success, sets `c.set("jwtPayload", payload)` and `c.set("userId", sub)`.
 * On failure, returns 401.
 */
export function protectRoute() {
  return async (c: any, next: () => Promise<void>) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ success: false, error: "Authorization header required" }, 401);
    }

    const token = authHeader.substring(7);
    try {
      const payload = await verify(token, getJwtSecret(c.env), "HS256");
      c.set("jwtPayload", payload);
      c.set("userId", payload.sub);
      await next();
    } catch (err) {
      return c.json({ success: false, error: "Invalid or expired token" }, 401);
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Phase 21: Superadmin Middleware
// ─────────────────────────────────────────────────────────────

/**
 * Hono middleware that first verifies JWT (via protectRoute logic),
 * then checks the user's role === 'superadmin' in D1.
 * On failure, returns 403.
 */
export function requireSuperadmin() {
  return async (c: any, next: () => Promise<void>) => {
    // Step 1: Verify JWT
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ success: false, error: "Authorization header required" }, 401);
    }

    const token = authHeader.substring(7);
    let payload: any;
    try {
      payload = await verify(token, getJwtSecret(c.env), "HS256");
    } catch (err) {
      return c.json({ success: false, error: "Invalid or expired token" }, 401);
    }

    c.set("jwtPayload", payload);
    c.set("userId", payload.sub);

    // Step 2: Check superadmin role in D1
    const row = await c.env.DB.prepare(
      "SELECT role FROM Users WHERE id = ?1"
    ).bind(payload.sub).first<{ role: string }>();

    if (!row || row.role !== "superadmin") {
      return c.json({ success: false, error: "Superadmin access required" }, 403);
    }

    await next();
  };
}
