/**
 * ============================================================
 * Phase 33: Stripe Billing Routes
 * ============================================================
 *
 * POST /checkout       — Creates a Stripe Checkout Session with
 *                         client_reference_id set to the internal
 *                         user_id AND customer_email for bulletproof
 *                         webhook reconciliation.
 *
 * POST /portal         — Creates a Stripe Billing Portal session
 *                         for self-service plan management.
 *
 * Security:
 *   - Both routes require JWT authentication (applied in index.ts)
 *   - All D1 queries use parameterized inputs
 *   - User identity is extracted from JWT claims, never from
 *     client-supplied body params
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";
import { CHECKOUT_PRICES } from "../utils/stripe";

export const billingRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// Stripe REST API type (subset)
// ─────────────────────────────────────────────────────────────

interface StripeSessionResponse {
  id: string;
  url: string;
  error?: { message: string };
}

interface StripeBillingPortalResponse {
  id: string;
  url: string;
  error?: { message: string };
}

// ─────────────────────────────────────────────────────────────
// POST /checkout — Create Stripe Checkout Session
// ─────────────────────────────────────────────────────────────

billingRouter.post("/checkout", async (c) => {
  try {
    const body = await c.req.json<{
      plan: string;          // "starter" | "autopilot" | "enterprise"
      success_url?: string;
      cancel_url?: string;
    }>();

    const plan = body.plan?.toLowerCase();
    if (!plan || !CHECKOUT_PRICES[plan]) {
      return c.json(
        { success: false, error: `Invalid plan. Choose: ${Object.keys(CHECKOUT_PRICES).join(", ")}` },
        400,
      );
    }

    // ── Extract user identity from JWT (set by protectRoute middleware) ──
    // The auth middleware stores decoded claims on c.get("jwtPayload")
    const jwtPayload = c.get("jwtPayload") as
      | { sub: string; email: string }
      | undefined;

    if (!jwtPayload?.sub || !jwtPayload?.email) {
      return c.json({ success: false, error: "Authentication required" }, 401);
    }

    const userId = jwtPayload.sub;
    const userEmail = jwtPayload.email;

    // ── Lookup user in D1 to check existing Stripe customer ──
    const user = await c.env.DB.prepare(
      "SELECT id, email, stripe_customer_id, plan_tier FROM Users WHERE id = ?",
    )
      .bind(userId)
      .first<{
        id: string;
        email: string;
        stripe_customer_id: string | null;
        plan_tier: string;
      }>();

    if (!user) {
      return c.json({ success: false, error: "User not found" }, 404);
    }

    // ── Guard: Stripe must be configured ──
    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ success: false, error: "Stripe not configured" }, 503);
    }

    // ── Build Stripe Checkout Session via REST API ──
    const priceId = CHECKOUT_PRICES[plan];
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");

    // ━━━ CRITICAL: Inject user identity for webhook reconciliation ━━━
    // client_reference_id → internal user_id (primary lookup key)
    // customer_email      → pre-fills the Stripe checkout email field
    // metadata.user_email → backup email in case customer_email is null
    // metadata.user_id    → redundant backup for safety
    // metadata.plan_tier  → tier name for fallback resolution
    params.set("client_reference_id", userId);
    params.set("customer_email", userEmail);
    params.set("metadata[user_id]", userId);
    params.set("metadata[user_email]", userEmail);
    params.set("metadata[plan_tier]", plan);

    params.set(
      "success_url",
      body.success_url || "https://swarme.io/settings?session_id={CHECKOUT_SESSION_ID}",
    );
    params.set(
      "cancel_url",
      body.cancel_url || "https://swarme.io/settings?canceled=true",
    );

    // If user already has a Stripe customer, reuse it (avoids duplicates)
    if (user.stripe_customer_id) {
      params.set("customer", user.stripe_customer_id);
      // When reusing a customer, customer_email is not allowed
      params.delete("customer_email");
    }

    // Allow promotion codes for growth experiments
    params.set("allow_promotion_codes", "true");

    const stripeRes = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const session = (await stripeRes.json()) as StripeSessionResponse;

    if (!stripeRes.ok || session.error) {
      console.error(`[Billing] Stripe error: ${session.error?.message}`);
      return c.json(
        { success: false, error: session.error?.message || "Stripe session creation failed" },
        502,
      );
    }

    return c.json({
      success: true,
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Billing] Checkout error: ${message}`);
    return c.json({ success: false, error: message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /portal — Create Stripe Billing Portal Session
// ─────────────────────────────────────────────────────────────

billingRouter.post("/portal", async (c) => {
  try {
    const jwtPayload = c.get("jwtPayload") as
      | { sub: string; email: string }
      | undefined;

    if (!jwtPayload?.sub) {
      return c.json({ success: false, error: "Authentication required" }, 401);
    }

    // Lookup user's Stripe customer ID
    const user = await c.env.DB.prepare(
      "SELECT stripe_customer_id FROM Users WHERE id = ?",
    )
      .bind(jwtPayload.sub)
      .first<{ stripe_customer_id: string | null }>();

    if (!user?.stripe_customer_id) {
      return c.json(
        { success: false, error: "No active billing account. Subscribe to a plan first." },
        404,
      );
    }

    if (!c.env.STRIPE_SECRET_KEY) {
      return c.json({ success: false, error: "Stripe not configured" }, 503);
    }

    const params = new URLSearchParams();
    params.set("customer", user.stripe_customer_id);
    params.set("return_url", "https://swarme.io/settings");

    const portalRes = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    const portal = (await portalRes.json()) as StripeBillingPortalResponse;

    if (!portalRes.ok || portal.error) {
      return c.json(
        { success: false, error: portal.error?.message || "Portal session creation failed" },
        502,
      );
    }

    return c.json({
      success: true,
      portal_url: portal.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Billing] Portal error: ${message}`);
    return c.json({ success: false, error: message }, 500);
  }
});
