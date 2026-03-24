/**
 * ============================================================
 * Swarme — Phase 67: Enterprise Buyer Access Provisioning
 * ============================================================
 *
 * Manages scoped access tokens for enterprise data buyers.
 * Buyers get time-limited, prefix-scoped access to R2 lakehouse
 * data files.
 *
 * How it works:
 *   1. Admin creates a buyer via the admin panel
 *   2. System generates a signed access token (HMAC-SHA256)
 *   3. Token encodes: buyer_id, allowed table(s), prefix scope, expiry
 *   4. Buyer presents token to the /api/lakehouse/download endpoint
 *   5. System validates token, returns a time-limited R2 presigned URL
 *
 * Security model:
 *   - Tokens are HMAC-signed (not JWT — simpler, no library needed)
 *   - Each token is scoped to specific R2 prefixes
 *   - Tokens expire (default 7 days, configurable)
 *   - All access is logged in D1 for audit
 *   - Buyer list stored in KV for edge-speed validation
 *
 * Future: When Cloudflare adds native Iceberg sharing,
 * this layer swaps to provision Iceberg catalog credentials.
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

export interface BuyerConfig {
  id: string;
  name: string;
  email: string;
  allowed_tables: string[];
  r2_prefix_scope: string;
  created_at: string;
  expires_at: string;
  status: "active" | "revoked" | "expired";
}

export interface AccessToken {
  token: string;
  buyer_id: string;
  expires_at: string;
}

interface TokenPayload {
  bid: string;   // buyer_id
  pfx: string;   // R2 prefix scope
  tbl: string[];  // allowed tables
  exp: number;   // expiry (unix ms)
  iat: number;   // issued at (unix ms)
}

// ── Constants ────────────────────────────────────────────────

const KV_BUYER_PREFIX = "lakehouse:buyer:";
const DEFAULT_TOKEN_TTL_DAYS = 7;

// ── Token Generation ─────────────────────────────────────────

/**
 * Create a signed access token for a buyer.
 * Uses HMAC-SHA256 with the Worker's JWT_SECRET as the signing key.
 */
export async function createBuyerToken(
  env: Env,
  buyer: BuyerConfig,
  ttlDays: number = DEFAULT_TOKEN_TTL_DAYS,
): Promise<AccessToken> {
  const now = Date.now();
  const expiresAt = now + ttlDays * 86400_000;

  const payload: TokenPayload = {
    bid: buyer.id,
    pfx: buyer.r2_prefix_scope,
    tbl: buyer.allowed_tables,
    exp: expiresAt,
    iat: now,
  };

  const payloadStr = btoa(JSON.stringify(payload));
  const signature = await hmacSign(payloadStr, env.JWT_SECRET);
  const token = `${payloadStr}.${signature}`;

  return {
    token,
    buyer_id: buyer.id,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Validate and decode a buyer access token.
 * Returns the payload if valid, null if invalid/expired.
 */
export async function validateBuyerToken(
  token: string,
  env: Env,
): Promise<TokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadStr, signature] = parts;
    const expectedSig = await hmacSign(payloadStr, env.JWT_SECRET);

    if (signature !== expectedSig) return null;

    const payload: TokenPayload = JSON.parse(atob(payloadStr));

    // Check expiry
    if (payload.exp < Date.now()) return null;

    // Verify buyer is still active in KV
    const buyerRaw = await env.CONFIG_KV.get(`${KV_BUYER_PREFIX}${payload.bid}`);
    if (!buyerRaw) return null;

    const buyer: BuyerConfig = JSON.parse(buyerRaw);
    if (buyer.status !== "active") return null;

    return payload;
  } catch {
    return null;
  }
}

// ── Buyer Management ─────────────────────────────────────────

/**
 * Register a new enterprise data buyer.
 */
export async function registerBuyer(
  env: Env,
  input: {
    name: string;
    email: string;
    allowed_tables: string[];
    ttl_days?: number;
  },
): Promise<{ buyer: BuyerConfig; token: AccessToken }> {
  const id = `buyer_${crypto.randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();
  const ttlDays = input.ttl_days || DEFAULT_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();

  const buyer: BuyerConfig = {
    id,
    name: input.name,
    email: input.email,
    allowed_tables: input.allowed_tables,
    r2_prefix_scope: "lakehouse/events/",
    created_at: now,
    expires_at: expiresAt,
    status: "active",
  };

  // Store in KV for fast edge validation
  await env.CONFIG_KV.put(
    `${KV_BUYER_PREFIX}${id}`,
    JSON.stringify(buyer),
    { expirationTtl: ttlDays * 86400 },
  );

  // Also store buyer list index
  const listRaw = await env.CONFIG_KV.get("lakehouse:buyers:index");
  const list: string[] = listRaw ? JSON.parse(listRaw) : [];
  if (!list.includes(id)) list.push(id);
  await env.CONFIG_KV.put("lakehouse:buyers:index", JSON.stringify(list));

  const token = await createBuyerToken(env, buyer, ttlDays);

  return { buyer, token };
}

/**
 * Revoke a buyer's access.
 */
export async function revokeBuyer(
  env: Env,
  buyerId: string,
): Promise<boolean> {
  const raw = await env.CONFIG_KV.get(`${KV_BUYER_PREFIX}${buyerId}`);
  if (!raw) return false;

  const buyer: BuyerConfig = JSON.parse(raw);
  buyer.status = "revoked";

  await env.CONFIG_KV.put(
    `${KV_BUYER_PREFIX}${buyerId}`,
    JSON.stringify(buyer),
  );

  return true;
}

/**
 * List all registered buyers.
 */
export async function listBuyers(
  env: Env,
): Promise<BuyerConfig[]> {
  const listRaw = await env.CONFIG_KV.get("lakehouse:buyers:index");
  const ids: string[] = listRaw ? JSON.parse(listRaw) : [];

  const buyers: BuyerConfig[] = [];
  for (const id of ids) {
    const raw = await env.CONFIG_KV.get(`${KV_BUYER_PREFIX}${id}`);
    if (raw) {
      buyers.push(JSON.parse(raw));
    }
  }

  return buyers;
}

// ── R2 File Access ───────────────────────────────────────────

/**
 * Generate a download URL for a specific R2 file.
 * Validates that the buyer's token grants access to the file's prefix.
 */
export async function getBuyerFileAccess(
  env: Env,
  token: string,
  r2Key: string,
): Promise<{ url: string; expires_in: number } | null> {
  const payload = await validateBuyerToken(token, env);
  if (!payload) return null;

  // Verify prefix scope
  if (!r2Key.startsWith(payload.pfx)) return null;

  // For now, we return the R2 object directly via the Worker.
  // In production with R2 presigned URLs (when available),
  // this would generate a time-limited presigned URL.
  // The caller should proxy through a /api/lakehouse/download endpoint.
  return {
    url: `/api/lakehouse/download?key=${encodeURIComponent(r2Key)}`,
    expires_in: 3600,
  };
}

// ── HMAC-SHA256 Helper ───────────────────────────────────────

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
