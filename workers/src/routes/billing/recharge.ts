/**
 * ============================================================
 * Phase 51: Stripe Wallet Recharge Routes
 * ============================================================
 *
 * Endpoints:
 *   POST /top-up         → Manual one-time wallet top-up via
 *                           Stripe Payment Intent
 *   POST /confirm-top-up → Confirm after Stripe redirects back
 *
 * Cron:
 *   handleWalletRecharge() → Hourly auto-recharge for wallets
 *                            below threshold using saved payment
 *                            method (off-session)
 *
 * All D1 queries use parameterized inputs.
 * All queries filter by domain_id for compartmentalization.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";
import { depositFunds, getOrCreateWallet } from "../../utils/wallet";
import type { Wallet } from "../../utils/wallet";

export const walletRechargeRouter = new Hono<{ Bindings: Env }>();

// ── Types ────────────────────────────────────────────────────

interface StripePaymentIntentResponse {
  id: string;
  status: string;
  client_secret: string;
  error?: { message: string };
}

// ── Stripe API Helper ────────────────────────────────────────

async function stripeRequest(
  env: Env,
  endpoint: string,
  params: Record<string, string>
): Promise<any> {
  const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  return response.json();
}

// ─────────────────────────────────────────────────────────────
// POST /top-up — Manual one-time wallet top-up
// ─────────────────────────────────────────────────────────────

walletRechargeRouter.post("/top-up", async (c) => {
  const userId = c.get("userId") as string;

  try {
    const body = await c.req.json<{
      domain_id: string;
      amount_cents: number;
    }>();

    if (!body.domain_id || !body.amount_cents || body.amount_cents < 500) {
      return c.json(
        { success: false, error: "domain_id and amount_cents (min 500) required" },
        400
      );
    }

    const wallet = await getOrCreateWallet(c.env, body.domain_id);

    // Get or create Stripe customer
    let customerId = wallet.stripe_customer_id;
    if (!customerId) {
      const user = await c.env.DB.prepare(
        "SELECT email FROM Users WHERE id = ?1"
      )
        .bind(userId)
        .first<{ email: string }>();

      const customer = await stripeRequest(c.env, "/customers", {
        email: user?.email || "",
        "metadata[domain_id]": body.domain_id,
        "metadata[wallet_id]": wallet.id,
      });

      customerId = customer.id;

      // Save Stripe customer ID to wallet
      await c.env.DB.prepare(
        "UPDATE Wallets SET stripe_customer_id = ?1 WHERE id = ?2 AND domain_id = ?3"
      )
        .bind(customerId, wallet.id, body.domain_id)
        .run();
    }

    // Create Payment Intent
    const pi: StripePaymentIntentResponse = await stripeRequest(
      c.env,
      "/payment_intents",
      {
        amount: body.amount_cents.toString(),
        currency: "usd",
        customer: customerId,
        "metadata[type]": "wallet_top_up",
        "metadata[domain_id]": body.domain_id,
        "metadata[wallet_id]": wallet.id,
        setup_future_usage: "off_session",
      }
    );

    if (pi.error) {
      return c.json({ success: false, error: pi.error.message }, 400);
    }

    return c.json({
      success: true,
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      status: pi.status,
    });
  } catch (err: any) {
    console.error("[Wallet Recharge] Top-up error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /confirm-top-up — After Stripe confirms the payment
// ─────────────────────────────────────────────────────────────

walletRechargeRouter.post("/confirm-top-up", async (c) => {
  try {
    const body = await c.req.json<{
      domain_id: string;
      payment_intent_id: string;
      amount_cents: number;
    }>();

    if (!body.domain_id || !body.payment_intent_id || !body.amount_cents) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    // Credit the wallet
    const result = await depositFunds(
      c.env,
      body.domain_id,
      body.amount_cents,
      `Manual top-up via Stripe`,
      body.payment_intent_id
    );

    return c.json({
      success: true,
      new_balance_cents: result.new_balance_cents,
      transaction_id: result.transaction_id,
    });
  } catch (err: any) {
    console.error("[Wallet Recharge] Confirm error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Hourly Auto-Recharge Cron
// ─────────────────────────────────────────────────────────────

/**
 * Queries wallets where:
 *   - auto_recharge_enabled = 1
 *   - balance_cents <= recharge_threshold_cents
 *   - stripe_customer_id is set
 *
 * For each, creates a Stripe PaymentIntent with:
 *   - confirm: true
 *   - off_session: true
 *   - using the customer's saved default payment method
 *
 * On success, credits the wallet via depositFunds().
 */
export async function handleWalletRecharge(env: Env): Promise<{
  checked: number;
  recharged: number;
  failed: number;
}> {
  let checked = 0;
  let recharged = 0;
  let failed = 0;

  try {
    // Find wallets needing recharge
    const { results } = await env.DB.prepare(
      `SELECT * FROM Wallets
       WHERE auto_recharge_enabled = 1
         AND balance_cents <= recharge_threshold_cents
         AND stripe_customer_id != ''
         AND stripe_customer_id IS NOT NULL`
    ).all<Wallet>();

    const wallets = results || [];
    checked = wallets.length;

    for (const wallet of wallets) {
      try {
        // Get the customer's default payment method
        const customerResp = await fetch(
          `https://api.stripe.com/v1/customers/${wallet.stripe_customer_id}`,
          {
            headers: {
              Authorization: `Basic ${btoa(`${env.STRIPE_SECRET_KEY}:`)}`,
            },
          }
        );
        const customer = (await customerResp.json()) as any;
        const defaultPm =
          customer.invoice_settings?.default_payment_method ||
          customer.default_source;

        if (!defaultPm) {
          console.warn(
            `[Auto-Recharge] Wallet ${wallet.id}: no default payment method for customer ${wallet.stripe_customer_id}`
          );
          failed++;
          continue;
        }

        // Create confirmed off-session PaymentIntent
        const pi: any = await stripeRequest(env, "/payment_intents", {
          amount: wallet.recharge_amount_cents.toString(),
          currency: "usd",
          customer: wallet.stripe_customer_id,
          payment_method: defaultPm,
          confirm: "true",
          off_session: "true",
          "metadata[type]": "auto_recharge",
          "metadata[domain_id]": wallet.domain_id,
          "metadata[wallet_id]": wallet.id,
        });

        if (pi.error || pi.status !== "succeeded") {
          console.error(
            `[Auto-Recharge] Wallet ${wallet.id}: Stripe error — ${pi.error?.message || pi.status}`
          );
          failed++;
          continue;
        }

        // Credit the wallet
        await depositFunds(
          env,
          wallet.domain_id,
          wallet.recharge_amount_cents,
          `Auto-recharge (balance was $${(wallet.balance_cents / 100).toFixed(2)})`,
          pi.id
        );

        recharged++;
        console.log(
          `[Auto-Recharge] Wallet ${wallet.id}: recharged $${(wallet.recharge_amount_cents / 100).toFixed(2)} — new balance $${((wallet.balance_cents + wallet.recharge_amount_cents) / 100).toFixed(2)}`
        );
      } catch (err) {
        console.error(`[Auto-Recharge] Wallet ${wallet.id}: error —`, err);
        failed++;
      }
    }
  } catch (err) {
    console.error("[Auto-Recharge] Fatal error:", err);
  }

  console.log(
    `[Auto-Recharge] Complete: ${checked} checked, ${recharged} recharged, ${failed} failed`
  );

  return { checked, recharged, failed };
}
