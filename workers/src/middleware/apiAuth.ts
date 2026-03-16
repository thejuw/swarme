/**
 * ============================================================
 * Phase 46: API Key Authentication Middleware
 * ============================================================
 *
 * Authenticates public /v1/* requests using Bearer API keys.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header.
 *   2. SHA-256 hash the token using WebCrypto (zero-knowledge).
 *   3. Query D1 for a Users row with a matching api_key_hash.
 *   4. Rate-limit to 100 requests/minute per user via CONFIG_KV.
 *   5. Update api_key_last_used timestamp on the Users row.
 *   6. Attach userId and userPlan to Hono context for downstream use.
 *
 * Security:
 *   - Raw API keys are NEVER stored — only the SHA-256 hash.
 *   - Rate-limit state uses KV with 60s TTL for automatic expiry.
 *   - All D1 queries use parameterized inputs.
 * ============================================================
 */

import { Context, Next } from "hono";
import type { Env } from "../index";

const RATE_LIMIT_MAX = 100;       // max requests per window
const RATE_LIMIT_WINDOW_SEC = 60; // 1-minute sliding window

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 */
function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 hash a plaintext string using WebCrypto.
 * Returns the hash as a lowercase hex string.
 */
async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return bufToHex(hashBuffer);
}

/**
 * Hono middleware that validates Bearer API keys for /v1/* endpoints.
 *
 * On success, sets:
 *   - c.set("userId", <string>)
 *   - c.set("userPlan", <string>)
 *
 * On failure, returns 401 or 429 JSON.
 */
export function apiAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // 1. Extract Bearer token
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        { error: "Missing or invalid Authorization header. Use: Bearer es_live_..." },
        401
      );
    }
    const token = authHeader.slice(7).trim();
    if (!token || !token.startsWith("es_live_")) {
      return c.json(
        { error: "Invalid API key format. Keys start with es_live_" },
        401
      );
    }

    // 2. SHA-256 hash the raw token
    const hash = await sha256Hex(token);

    // 3. Look up user by api_key_hash in D1
    const user = await c.env.DB.prepare(
      "SELECT id, plan, status FROM Users WHERE api_key_hash = ?1"
    )
      .bind(hash)
      .first<{ id: string; plan: string; status: string }>();

    if (!user) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    if (user.status !== "active") {
      return c.json({ error: "Account suspended or inactive" }, 403);
    }

    // 4. Rate-limit check via KV (100 req/min per user)
    const kvKey = `ratelimit:api:${user.id}`;
    const currentRaw = await c.env.CONFIG_KV.get(kvKey);
    const currentCount = currentRaw ? parseInt(currentRaw, 10) : 0;

    if (currentCount >= RATE_LIMIT_MAX) {
      return c.json(
        {
          error: "Rate limit exceeded",
          limit: RATE_LIMIT_MAX,
          window: `${RATE_LIMIT_WINDOW_SEC}s`,
          retry_after: RATE_LIMIT_WINDOW_SEC,
        },
        429
      );
    }

    // Increment counter with TTL
    await c.env.CONFIG_KV.put(kvKey, String(currentCount + 1), {
      expirationTtl: RATE_LIMIT_WINDOW_SEC,
    });

    // 5. Update last-used timestamp (fire-and-forget, don't block response)
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        "UPDATE Users SET api_key_last_used = ?1 WHERE id = ?2"
      )
        .bind(new Date().toISOString(), user.id)
        .run()
    );

    // 6. Attach user context for downstream handlers
    c.set("userId", user.id);
    c.set("userPlan", user.plan);

    // Set rate-limit response headers
    c.header("X-RateLimit-Limit", String(RATE_LIMIT_MAX));
    c.header("X-RateLimit-Remaining", String(RATE_LIMIT_MAX - currentCount - 1));

    await next();
  };
}
