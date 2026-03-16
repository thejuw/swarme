/**
 * ============================================================
 * Phase 33: Stripe Price → Internal Tier Mapping
 * ============================================================
 *
 * Maps Stripe Price IDs to internal plan tiers and task limits.
 *
 * ⚠ IMPORTANT: Replace the placeholder Price IDs below with your
 *   actual Stripe Price IDs from the Stripe Dashboard → Products.
 *   Each key is a Stripe price_xxx string; each value defines the
 *   internal tier name and monthly task limit.
 * ============================================================
 */

export interface TierConfig {
  tier: "free" | "starter" | "autopilot" | "enterprise";
  taskLimit: number;
  label: string;
}

/**
 * Map of Stripe Price ID → internal tier configuration.
 *
 * Replace these placeholder IDs with real ones from Stripe Dashboard:
 *   Stripe Dashboard → Products → [Product] → Pricing → Copy Price ID
 */
const PRICE_TIER_MAP: Record<string, TierConfig> = {
  // ── Starter: $199/mo ──
  "price_starter_monthly_placeholder": {
    tier: "starter",
    taskLimit: 100,
    label: "Starter ($199/mo)",
  },
  "price_starter_yearly_placeholder": {
    tier: "starter",
    taskLimit: 100,
    label: "Starter ($1,990/yr)",
  },

  // ── Autopilot: $499/mo ──
  "price_autopilot_monthly_placeholder": {
    tier: "autopilot",
    taskLimit: 500,
    label: "Autopilot ($499/mo)",
  },
  "price_autopilot_yearly_placeholder": {
    tier: "autopilot",
    taskLimit: 500,
    label: "Autopilot ($4,990/yr)",
  },

  // ── Enterprise: $999/mo ──
  "price_enterprise_monthly_placeholder": {
    tier: "enterprise",
    taskLimit: -1, // unlimited
    label: "Enterprise ($999/mo)",
  },
  "price_enterprise_yearly_placeholder": {
    tier: "enterprise",
    taskLimit: -1, // unlimited
    label: "Enterprise ($9,990/yr)",
  },
};

/**
 * Resolve a Stripe Price ID to internal tier config.
 * Returns null if the Price ID is unknown (defensive fallback).
 */
export function resolveTierFromPrice(priceId: string): TierConfig | null {
  return PRICE_TIER_MAP[priceId] ?? null;
}

/**
 * Fallback tier for when a subscription is canceled or payment fails.
 */
export const FREE_TIER: TierConfig = {
  tier: "free",
  taskLimit: 0,
  label: "Free (Canceled)",
};

/**
 * Stripe Checkout line-item price IDs keyed by plan name.
 * Used in billing.ts to create Checkout Sessions with real Price IDs
 * instead of inline price_data.
 *
 * Replace placeholders before going live.
 */
export const CHECKOUT_PRICES: Record<string, string> = {
  starter: "price_starter_monthly_placeholder",
  autopilot: "price_autopilot_monthly_placeholder",
  enterprise: "price_enterprise_monthly_placeholder",
};

/**
 * ── Stripe Signature Verification (Web Crypto) ──────────────
 *
 * Verifies the Stripe-Signature header using HMAC-SHA256 via the
 * Web Crypto API (no Node.js crypto dependency — edge-safe).
 *
 * @param rawBody   The raw request body as a string
 * @param signature The Stripe-Signature header value
 * @param secret    STRIPE_WEBHOOK_SECRET environment variable
 * @param tolerance Max age in seconds (default 300 = 5 minutes)
 * @returns The parsed event object on success
 * @throws  Error on verification failure
 */
export async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string,
  tolerance: number = 300,
): Promise<Record<string, unknown>> {
  // Parse "t=123,v1=abc..." header
  const elements = signature.split(",");
  const timestampStr = elements.find((e) => e.startsWith("t="))?.split("=")[1];
  const sigHash = elements
    .find((e) => e.startsWith("v1="))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!timestampStr || !sigHash) {
    throw new Error("Invalid Stripe signature format");
  }

  // Compute HMAC-SHA256
  const payload = `${timestampStr}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const expectedSig = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison (best-effort in JS — no timing leak on length)
  if (expectedSig.length !== sigHash.length) {
    throw new Error("Stripe signature verification failed");
  }
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ sigHash.charCodeAt(i);
  }
  if (mismatch !== 0) {
    throw new Error("Stripe signature verification failed");
  }

  // Verify timestamp tolerance
  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new Error("Stripe webhook timestamp outside tolerance window");
  }

  return JSON.parse(rawBody);
}
