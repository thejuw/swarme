/**
 * ============================================================
 * Phase 33: Stripe Webhook Receiver & Automated Provisioning
 * ============================================================
 *
 * POST /stripe   — Receives Stripe webhook events, verifies the
 *                   cryptographic signature via Web Crypto HMAC-SHA256,
 *                   and autonomously provisions/deprovisions the user's
 *                   plan_tier and task_limit in D1.
 *
 * Handled events:
 *   1. checkout.session.completed  → First-time activation
 *   2. customer.subscription.updated → Upgrade / downgrade
 *   3. customer.subscription.deleted → Churn / cancellation
 *
 * Security:
 *   - Raw body is read once and passed to verifyStripeSignature()
 *   - HMAC-SHA256 is computed via Web Crypto (edge-safe, no Node deps)
 *   - Timestamp tolerance rejects replay attacks (5 min window)
 *   - All D1 queries use parameterized inputs (SQL injection safe)
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../index";
import {
  verifyStripeSignature,
  resolveTierFromPrice,
  FREE_TIER,
} from "../utils/stripe";

export const webhookRouter = new Hono<{ Bindings: Env }>();

// ─────────────────────────────────────────────────────────────
// Stripe Webhook Types (only what we need)
// ─────────────────────────────────────────────────────────────

interface StripeCheckoutSession {
  id: string;
  customer: string;
  customer_email: string | null;
  subscription: string | null;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  line_items?: {
    data: Array<{
      price: { id: string };
    }>;
  };
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  items: {
    data: Array<{
      price: { id: string };
    }>;
  };
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeCheckoutSession | StripeSubscription;
  };
}

// ─────────────────────────────────────────────────────────────
// POST /stripe — Secure Webhook Endpoint
// ─────────────────────────────────────────────────────────────

webhookRouter.post("/stripe", async (c) => {
  // ── Guard: webhook secret must be configured ──
  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook secret not configured" }, 503);
  }

  // ── Guard: signature header must be present ──
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  // ── Read raw body ONCE (before any JSON parsing) ──
  const rawBody = await c.req.text();

  // ── Cryptographic Verification ──
  let event: StripeEvent;
  try {
    const parsed = await verifyStripeSignature(
      rawBody,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
    event = parsed as unknown as StripeEvent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    console.error(`[Stripe Webhook] Signature rejected: ${msg}`);
    return c.json({ error: msg }, 400);
  }

  console.log(`[Stripe Webhook] ✓ Verified event: ${event.type} (${event.id})`);

  // ─────────────────────────────────────────────────────────
  // Event Dispatch
  // ─────────────────────────────────────────────────────────

  try {
    switch (event.type) {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Case 1: checkout.session.completed
      // First-time subscription activation after Stripe Checkout.
      // Links Stripe Customer → internal User, sets plan_tier.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "checkout.session.completed": {
        const session = event.data.object as StripeCheckoutSession;
        const stripeCustomerId = session.customer;
        const stripeSubId = session.subscription;
        const customerEmail = session.customer_email;
        const userId = session.client_reference_id; // internal user_id injected at checkout

        // Resolve which user to provision
        // Priority: client_reference_id (user_id) > customer_email > metadata.user_email
        const lookupEmail = customerEmail || session.metadata?.user_email;

        if (!userId && !lookupEmail) {
          console.error("[Stripe Webhook] checkout.session.completed: No user identifier found");
          return c.json({ received: true, warning: "No user identifier" });
        }

        // ── Resolve tier from line items ──
        // Checkout sessions don't include line_items by default in webhooks.
        // We retrieve the subscription to get the price ID.
        let tierConfig = null;

        if (stripeSubId && c.env.STRIPE_SECRET_KEY) {
          // Fetch the subscription to get the Price ID
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${stripeSubId}`,
            {
              headers: {
                Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
              },
            },
          );

          if (subRes.ok) {
            const sub = (await subRes.json()) as StripeSubscription;
            const priceId = sub.items?.data?.[0]?.price?.id;
            if (priceId) {
              tierConfig = resolveTierFromPrice(priceId);
            }
          }
        }

        // Fallback: resolve from metadata
        if (!tierConfig) {
          const metaTier = session.metadata?.plan_tier;
          if (metaTier === "starter") {
            tierConfig = { tier: "starter" as const, taskLimit: 100, label: "Starter" };
          } else if (metaTier === "autopilot") {
            tierConfig = { tier: "autopilot" as const, taskLimit: 500, label: "Autopilot" };
          } else if (metaTier === "enterprise") {
            tierConfig = { tier: "enterprise" as const, taskLimit: -1, label: "Enterprise" };
          } else {
            // Default to autopilot if nothing matches (safest paid tier)
            tierConfig = { tier: "autopilot" as const, taskLimit: 500, label: "Autopilot (default)" };
          }
        }

        // ── D1 UPDATE: provision the user ──
        if (userId) {
          // Lookup by internal user ID (most reliable)
          await c.env.DB.prepare(
            `UPDATE Users
             SET stripe_customer_id = ?,
                 stripe_subscription_id = ?,
                 plan_tier = ?,
                 task_limit = ?,
                 tasks_used_this_month = 0
             WHERE id = ?`,
          )
            .bind(stripeCustomerId, stripeSubId, tierConfig.tier, tierConfig.taskLimit, userId)
            .run();

          console.log(`[Stripe] User ${userId} provisioned → ${tierConfig.tier} (${tierConfig.label})`);
        } else if (lookupEmail) {
          // Fallback: lookup by email
          await c.env.DB.prepare(
            `UPDATE Users
             SET stripe_customer_id = ?,
                 stripe_subscription_id = ?,
                 plan_tier = ?,
                 task_limit = ?,
                 tasks_used_this_month = 0
             WHERE email = ?`,
          )
            .bind(stripeCustomerId, stripeSubId, tierConfig.tier, tierConfig.taskLimit, lookupEmail)
            .run();

          console.log(`[Stripe] User (${lookupEmail}) provisioned → ${tierConfig.tier} (${tierConfig.label})`);
        }

        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Case 2: customer.subscription.updated
      // Handles plan upgrades, downgrades, and status changes.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "customer.subscription.updated": {
        const sub = event.data.object as StripeSubscription;
        const stripeCustomerId = sub.customer;
        const newPriceId = sub.items?.data?.[0]?.price?.id;

        if (!newPriceId) {
          console.warn("[Stripe Webhook] subscription.updated: No price ID found");
          break;
        }

        const tierConfig = resolveTierFromPrice(newPriceId);
        if (!tierConfig) {
          console.warn(`[Stripe Webhook] subscription.updated: Unknown price ID: ${newPriceId}`);
          break;
        }

        // Also handle subscription status (past_due → freeze, active → restore)
        const isActive = sub.status === "active" || sub.status === "trialing";

        await c.env.DB.prepare(
          `UPDATE Users
           SET plan_tier = ?,
               task_limit = ?,
               stripe_subscription_id = ?
           WHERE stripe_customer_id = ?`,
        )
          .bind(
            isActive ? tierConfig.tier : "free",
            isActive ? tierConfig.taskLimit : 0,
            sub.id,
            stripeCustomerId,
          )
          .run();

        console.log(
          `[Stripe] Customer ${stripeCustomerId} subscription updated → ` +
          `${isActive ? tierConfig.tier : "free (inactive)"} (status: ${sub.status})`,
        );

        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Case 3: customer.subscription.deleted
      // Subscription fully canceled — revert to free tier.
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubscription;
        const stripeCustomerId = sub.customer;

        await c.env.DB.prepare(
          `UPDATE Users
           SET plan_tier = ?,
               task_limit = ?,
               stripe_subscription_id = NULL
           WHERE stripe_customer_id = ?`,
        )
          .bind(FREE_TIER.tier, FREE_TIER.taskLimit, stripeCustomerId)
          .run();

        console.log(`[Stripe] Customer ${stripeCustomerId} subscription deleted → free tier`);

        break;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Default: log and ACK unhandled events
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown provisioning error";
    console.error(`[Stripe Webhook] Provisioning error: ${msg}`);
    // Still return 200 so Stripe doesn't retry indefinitely
    return c.json({ received: true, error: msg });
  }

  // Always ACK with 200 so Stripe marks delivery as successful
  return c.json({ received: true });
});

// ─────────────────────────────────────────────────────────────
// Phase 41: Shopify Inventory Webhook
// ─────────────────────────────────────────────────────────────
//
// POST /shopify/inventory
//
// Receives `inventory_levels/update` webhooks from Shopify.
// Verifies HMAC-SHA256 signature using SHOPIFY_WEBHOOK_SECRET,
// then stores the inventory level in CONFIG_KV so the Durable
// Object can circuit-break on low-stock products.
//
// KV key pattern: `inventory:{product_url}`
// KV value: JSON `{ available: number, updated_at: string, inventory_item_id: number, location_id: number }`
//
// Shopify payload shape (inventory_levels/update):
//   { inventory_item_id, location_id, available, updated_at }
//
// To resolve inventory_item_id → product URL, we query Shopify's
// Admin API. If the token is missing or the lookup fails, we still
// store the level keyed by inventory_item_id as a fallback.
// ─────────────────────────────────────────────────────────────

interface ShopifyInventoryPayload {
  inventory_item_id: number;
  location_id: number;
  available: number | null;
  updated_at: string;
}

/**
 * Verify Shopify HMAC-SHA256 signature (Web Crypto, edge-safe).
 * Shared helper — identical to the one in index.ts for the orders webhook.
 */
async function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody)
  );
  const computed = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );
  return computed === hmacHeader;
}

webhookRouter.post("/shopify/inventory", async (c) => {
  // ── Step 1: Read raw body for HMAC verification ──
  const rawBody = await c.req.text();
  const hmacHeader = c.req.header("X-Shopify-Hmac-Sha256") ?? "";

  // ── Step 2: Validate HMAC (skip if no secret — dev mode) ──
  if (c.env.SHOPIFY_WEBHOOK_SECRET) {
    const valid = await verifyShopifyHmac(
      rawBody,
      hmacHeader,
      c.env.SHOPIFY_WEBHOOK_SECRET
    );
    if (!valid) {
      console.error("[Inventory Webhook] Invalid Shopify HMAC signature");
      return c.json({ success: false, error: "Invalid signature" }, 401);
    }
  }

  try {
    // ── Step 3: Parse the inventory payload ──
    const payload = JSON.parse(rawBody) as ShopifyInventoryPayload;
    const { inventory_item_id, location_id, available, updated_at } = payload;
    const quantity = available ?? 0;

    console.log(
      `[Inventory Webhook] inventory_item_id=${inventory_item_id} ` +
      `location_id=${location_id} available=${quantity}`
    );

    // ── Step 4: Resolve inventory_item_id → product handle/URL ──
    // Try to find the associated Shopify product handle by querying
    // the Shopify Admin API. This requires a per-project access token.
    //
    // Since webhooks are global (not project-scoped), we check the
    // X-Shopify-Shop-Domain header to identify which project.
    const shopDomain = c.req.header("X-Shopify-Shop-Domain") ?? "";
    let productUrl = `shopify:inventory_item:${inventory_item_id}`;

    if (shopDomain) {
      // Attempt to find the project with this Shopify domain
      const projectRow = await c.env.DB.prepare(
        `SELECT id FROM Projects
         WHERE shopify_domain = ?
         LIMIT 1`
      ).bind(shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")).first<{ id: string }>();

      if (projectRow) {
        const accessToken = await c.env.CONFIG_KV.get(
          `vault:project:${projectRow.id}:shopify_access_token`
        );

        if (accessToken) {
          try {
            // Query Shopify Admin API to resolve inventory_item → product
            const shopifyRes = await fetch(
              `https://${shopDomain}/admin/api/2024-01/inventory_items/${inventory_item_id}.json`,
              {
                headers: {
                  "X-Shopify-Access-Token": accessToken,
                  "Content-Type": "application/json",
                },
              }
            );

            if (shopifyRes.ok) {
              const data = await shopifyRes.json() as {
                inventory_item: {
                  id: number;
                  sku: string;
                  tracked: boolean;
                };
              };

              // Now get the product variant with this inventory_item_id
              const variantRes = await fetch(
                `https://${shopDomain}/admin/api/2024-01/variants.json?` +
                `inventory_item_ids=${inventory_item_id}`,
                {
                  headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json",
                  },
                }
              );

              if (variantRes.ok) {
                const variantData = await variantRes.json() as {
                  variants: Array<{
                    product_id: number;
                    id: number;
                  }>;
                };

                if (variantData.variants?.[0]?.product_id) {
                  const productId = variantData.variants[0].product_id;
                  // Fetch the product handle
                  const productRes = await fetch(
                    `https://${shopDomain}/admin/api/2024-01/products/${productId}.json?fields=handle`,
                    {
                      headers: {
                        "X-Shopify-Access-Token": accessToken,
                        "Content-Type": "application/json",
                      },
                    }
                  );

                  if (productRes.ok) {
                    const productData = await productRes.json() as {
                      product: { handle: string };
                    };
                    productUrl = `https://${shopDomain}/products/${productData.product.handle}`;
                  }
                }
              }
            }
          } catch (apiErr) {
            // Shopify API lookup failed — fall back to inventory_item_id key
            console.warn(
              `[Inventory Webhook] Shopify API lookup failed for item ${inventory_item_id}: ` +
              (apiErr instanceof Error ? apiErr.message : "Unknown error")
            );
          }
        }
      }
    }

    // ── Step 5: Store inventory level in CONFIG_KV ──
    const kvKey = `inventory:${productUrl}`;
    const kvValue = JSON.stringify({
      available: quantity,
      updated_at: updated_at || new Date().toISOString(),
      inventory_item_id,
      location_id,
      product_url: productUrl,
    });

    await c.env.CONFIG_KV.put(kvKey, kvValue, {
      // TTL of 24 hours — if Shopify stops sending webhooks,
      // stale inventory data auto-expires rather than blocking indefinitely
      expirationTtl: 86400,
    });

    console.log(
      `[Inventory Webhook] Stored: ${kvKey} → available=${quantity}`
    );

    // Also store a reverse lookup: inventory_item_id → product_url
    // so the DO can resolve product URLs from inventory_item_ids
    await c.env.CONFIG_KV.put(
      `inventory:item_map:${inventory_item_id}`,
      productUrl,
      { expirationTtl: 86400 }
    );

    return c.json({
      success: true,
      inventory_item_id,
      product_url: productUrl,
      available: quantity,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Inventory Webhook] Processing error: ${msg}`);
    // Return 200 so Shopify doesn't retry indefinitely
    return c.json({ success: false, error: msg });
  }
});
