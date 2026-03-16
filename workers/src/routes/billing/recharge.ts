/**
 * ============================================================
 * Phase 51.5: Swarme Credit Purchase & Auto-Recharge Routes
 * ============================================================
 *
 * Endpoints:
 *   POST /purchase        → Purchase credits via Stripe
 *   POST /confirm-purchase → Confirm after Stripe redirect
 *
 * Cron:
 *   handleCreditRecharge() → Hourly auto-recharge for balances
 *                            below threshold using saved payment
 *                            method (off-session)
 *
 * Credits are non-refundable digital software licenses.
 * All D1 queries use parameterized inputs.
 * All queries filter by domain_id for compartmentalization.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";
import { depositCredits, getOrCreateBalance } from "../../utils/wallet";
import type { CreditBalance } from "../../utils/wallet";

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
// POST /top-up — Purchase Swarme Credits via Stripe
// (route kept as /top-up for API backward compat)
// ─────────────────────────────────────────────────────────────

walletRechargeRouter.post("/top-up", async (c) => {
  const userId = c.get("userId") as string;

  try {
    const body = await c.req.json<{
      domain_id: string;
      amount_credits: number;
    }>();

    if (!body.domain_id || !body.amount_credits || body.amount_credits < 500) {
      return c.json(
        { success: false, error: "domain_id and amount_credits (min 500) required" },
        400
      );
    }

    const balance = await getOrCreateBalance(c.env, body.domain_id);

    // Get or create Stripe customer
    let customerId = balance.stripe_customer_id;
    if (!customerId) {
      const user = await c.env.DB.prepare(
        "SELECT email FROM Users WHERE id = ?1"
      )
        .bind(userId)
        .first<{ email: string }>();

      const customer = await stripeRequest(c.env, "/customers", {
        email: user?.email || "",
        "metadata[domain_id]": body.domain_id,
        "metadata[balance_id]": balance.id,
      });

      customerId = customer.id;

      await c.env.DB.prepare(
        "UPDATE Credit_Balances SET stripe_customer_id = ?1 WHERE id = ?2 AND domain_id = ?3"
      )
        .bind(customerId, balance.id, body.domain_id)
        .run();
    }

    // Create Payment Intent (Stripe charges in cents; 1 credit = 1 cent equivalent)
    const pi: StripePaymentIntentResponse = await stripeRequest(
      c.env,
      "/payment_intents",
      {
        amount: body.amount_credits.toString(),
        currency: "usd",
        customer: customerId,
        "metadata[type]": "credit_purchase",
        "metadata[domain_id]": body.domain_id,
        "metadata[balance_id]": balance.id,
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
    console.error("[Credit Purchase] Error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /confirm-top-up — Confirm credit purchase after Stripe
// ─────────────────────────────────────────────────────────────

walletRechargeRouter.post("/confirm-top-up", async (c) => {
  try {
    const body = await c.req.json<{
      domain_id: string;
      payment_intent_id: string;
      amount_credits: number;
    }>();

    if (!body.domain_id || !body.payment_intent_id || !body.amount_credits) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const result = await depositCredits(
      c.env,
      body.domain_id,
      body.amount_credits,
      `Credit purchase via Stripe`,
      body.payment_intent_id
    );

    return c.json({
      success: true,
      new_balance: result.new_balance,
      transaction_id: result.transaction_id,
    });
  } catch (err: any) {
    console.error("[Credit Purchase] Confirm error:", err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// Hourly Auto-Recharge Cron
// ─────────────────────────────────────────────────────────────

/**
 * Queries credit balances where:
 *   - auto_recharge_enabled = 1
 *   - available_credits <= recharge_threshold_credits
 *   - stripe_customer_id is set
 *
 * For each, creates a confirmed off-session Stripe PaymentIntent
 * using the customer's saved default payment method, then
 * credits the balance via depositCredits().
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
    const { results } = await env.DB.prepare(
      `SELECT * FROM Credit_Balances
       WHERE auto_recharge_enabled = 1
         AND available_credits <= recharge_threshold_credits
         AND stripe_customer_id != ''
         AND stripe_customer_id IS NOT NULL`
    ).all<CreditBalance>();

    const balances = results || [];
    checked = balances.length;

    for (const balance of balances) {
      try {
        // Get the customer's default payment method
        const customerResp = await fetch(
          `https://api.stripe.com/v1/customers/${balance.stripe_customer_id}`,
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
            `[Auto-Recharge] Balance ${balance.id}: no default payment method for customer ${balance.stripe_customer_id}`
          );
          failed++;
          continue;
        }

        // Create confirmed off-session PaymentIntent
        const pi: any = await stripeRequest(env, "/payment_intents", {
          amount: balance.recharge_amount_credits.toString(),
          currency: "usd",
          customer: balance.stripe_customer_id,
          payment_method: defaultPm,
          confirm: "true",
          off_session: "true",
          "metadata[type]": "credit_auto_recharge",
          "metadata[domain_id]": balance.domain_id,
          "metadata[balance_id]": balance.id,
        });

        if (pi.error || pi.status !== "succeeded") {
          console.error(
            `[Auto-Recharge] Balance ${balance.id}: Stripe error — ${pi.error?.message || pi.status}`
          );
          failed++;
          continue;
        }

        // Credit the balance
        await depositCredits(
          env,
          balance.domain_id,
          balance.recharge_amount_credits,
          `Auto-recharge (balance was ${balance.available_credits} credits)`,
          pi.id
        );

        recharged++;
        console.log(
          `[Auto-Recharge] Balance ${balance.id}: recharged ${balance.recharge_amount_credits} credits — new balance ${balance.available_credits + balance.recharge_amount_credits}`
        );
      } catch (err) {
        console.error(`[Auto-Recharge] Balance ${balance.id}: error —`, err);
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
