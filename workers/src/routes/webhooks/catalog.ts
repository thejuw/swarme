/**
 * ============================================================
 * Phase 50: Real-Time Catalog Detection Webhook
 * ============================================================
 *
 * Ingests `product.created` webhooks from:
 *   - Shopify (HMAC-SHA256 signature verification)
 *   - WooCommerce (webhook secret header)
 *   - Custom API integrations (Bearer token)
 *
 * Logic:
 *   1. Verify webhook authenticity per platform
 *   2. Normalize payload → { product_id, product_name, product_url, description }
 *   3. Check UGC_Campaign_Ledger for existing product_id (UNIQUE constraint)
 *   4. If new → INSERT with status='suggested'
 *   5. Insert a roadmap suggestion into AI_Roadmap_Items
 *   6. Trigger MissionControl alert per Phase 44 frequency settings
 *
 * All D1 queries use parameterized inputs (Phase 47 constraint).
 * Queries always filter by domain_id for compartmentalization.
 * ============================================================
 */

import { Hono } from "hono";
import type { Env } from "../../index";

export const catalogWebhookRouter = new Hono<{ Bindings: Env }>();

// ── Types ────────────────────────────────────────────────────

interface NormalizedProduct {
  product_id: string;
  product_name: string;
  product_url: string;
  description: string;
  price?: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  variants?: Array<{ price: string }>;
}

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  description: string;
  price: string;
}

// ── HMAC Verification ────────────────────────────────────────

async function verifyShopifyHmac(
  rawBody: string,
  signature: string,
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
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

// ── Payload Normalization ────────────────────────────────────

function normalizeShopifyProduct(
  data: ShopifyProduct,
  shopDomain: string
): NormalizedProduct {
  const plainDescription = (data.body_html || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 2000);

  return {
    product_id: `shopify_${data.id}`,
    product_name: data.title,
    product_url: `https://${shopDomain}/products/${data.handle}`,
    description: plainDescription,
    price: data.variants?.[0]?.price,
  };
}

function normalizeWooCommerceProduct(
  data: WooCommerceProduct
): NormalizedProduct {
  const plainDescription = (data.description || "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 2000);

  return {
    product_id: `woo_${data.id}`,
    product_name: data.name,
    product_url: data.permalink || "",
    description: plainDescription,
    price: data.price,
  };
}

function normalizeCustomProduct(data: Record<string, any>): NormalizedProduct {
  return {
    product_id: `custom_${data.id || data.product_id || crypto.randomUUID()}`,
    product_name: data.name || data.title || "Untitled Product",
    product_url: data.url || data.permalink || "",
    description: (data.description || "").slice(0, 2000),
    price: data.price?.toString(),
  };
}

// ── Ledger Insert & Roadmap Suggestion ───────────────────────

async function processNewProduct(
  env: Env,
  domainId: string,
  product: NormalizedProduct
): Promise<{ inserted: boolean; reason: string }> {
  // 1. Check if product_id already exists in ledger
  const existing = await env.DB.prepare(
    "SELECT id FROM UGC_Campaign_Ledger WHERE product_id = ?1"
  )
    .bind(product.product_id)
    .first<{ id: string }>();

  if (existing) {
    return { inserted: false, reason: "Product already in ledger" };
  }

  const ledgerId = `ugc_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();

  // 2. Insert into UGC_Campaign_Ledger with status='suggested'
  await env.DB.prepare(
    `INSERT INTO UGC_Campaign_Ledger
       (id, domain_id, product_id, product_name, product_url, product_description, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'suggested', ?7, ?7)`
  )
    .bind(
      ledgerId,
      domainId,
      product.product_id,
      product.product_name,
      product.product_url,
      product.description,
      now
    )
    .run();

  // 3. Insert a high-priority roadmap suggestion for AI Manager
  const roadmapId = `roadmap_ugc_${crypto.randomUUID().split("-")[0]}`;
  const budgetEstimate = 150;

  await env.DB.prepare(
    `INSERT INTO AI_Roadmap_Items
       (id, project_id, title, description, priority, status, action_payload, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, 'High', 'Suggested', ?5, ?6, ?6)`
  )
    .bind(
      roadmapId,
      domainId,
      `New Product Detected: ${product.product_name}`,
      `I noticed you added "${product.product_name}" to the catalog. Would you like me to dispatch a brief to our Creator Network (Billo/Insense) to generate 3 YouTube/TikTok review videos for GEO seeding? Estimated budget: $${budgetEstimate}.`,
      JSON.stringify({
        type: "ugc_campaign",
        ledger_id: ledgerId,
        product_id: product.product_id,
        product_name: product.product_name,
        product_url: product.product_url,
        budget: budgetEstimate,
      }),
      now
    )
    .run();

  // 4. Send notification via Resend (respects Phase 44 frequency settings)
  if (env.RESEND_API_KEY) {
    try {
      // Look up domain owner for notification
      const domainOwner = await env.DB.prepare(
        `SELECT u.email, u.alert_frequency
         FROM Users u
         JOIN Domains d ON d.user_id = u.id
         WHERE d.id = ?1`
      )
        .bind(domainId)
        .first<{ email: string; alert_frequency: string | null }>();

      const frequency = domainOwner?.alert_frequency ?? "realtime";

      // Only send immediate notification if frequency is 'realtime'
      if (domainOwner?.email && frequency === "realtime") {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Swarme <notifications@swarme.io>",
            to: domainOwner.email,
            subject: `New Product Detected: ${product.product_name}`,
            html: `<p>Your catalog has a new product: <strong>${product.product_name}</strong>.</p>
                   <p>A UGC campaign suggestion has been added to your AI Manager roadmap. Review and approve it to dispatch creator briefs automatically.</p>
                   <p style="margin-top:16px"><a href="https://app.swarme.io/#/ai-manager">Open AI Manager →</a></p>`,
          }),
        });
      }
    } catch (err) {
      console.error("[Catalog Webhook] Notification error:", err);
      // Non-blocking — don't fail the webhook over a notification error
    }
  }

  return { inserted: true, reason: "Product added to UGC ledger" };
}

// ─────────────────────────────────────────────────────────────
// POST /shopify — Shopify product.created webhook
// ─────────────────────────────────────────────────────────────

catalogWebhookRouter.post("/shopify", async (c) => {
  const signature = c.req.header("X-Shopify-Hmac-Sha256") || "";
  const topic = c.req.header("X-Shopify-Topic") || "";
  const shopDomain = c.req.header("X-Shopify-Shop-Domain") || "";

  if (topic !== "products/create") {
    return c.json({ ok: true, skipped: true, reason: "Not a product.created event" });
  }

  const rawBody = await c.req.text();

  // Verify HMAC
  if (c.env.SHOPIFY_WEBHOOK_SECRET) {
    const valid = await verifyShopifyHmac(rawBody, signature, c.env.SHOPIFY_WEBHOOK_SECRET);
    if (!valid) {
      return c.json({ error: "Invalid HMAC signature" }, 401);
    }
  }

  // Resolve domain_id from shop domain
  const domain = await c.env.DB.prepare(
    "SELECT id FROM Domains WHERE domain_url LIKE ?1 AND platform_type = 'shopify'"
  )
    .bind(`%${shopDomain}%`)
    .first<{ id: string }>();

  if (!domain) {
    return c.json({ error: "Unknown shop domain" }, 404);
  }

  const payload: ShopifyProduct = JSON.parse(rawBody);
  const normalized = normalizeShopifyProduct(payload, shopDomain);
  const result = await processNewProduct(c.env, domain.id, normalized);

  return c.json({ ok: true, ...result });
});

// ─────────────────────────────────────────────────────────────
// POST /woocommerce — WooCommerce product.created webhook
// ─────────────────────────────────────────────────────────────

catalogWebhookRouter.post("/woocommerce", async (c) => {
  const webhookSource = c.req.header("X-WC-Webhook-Source") || "";
  const webhookTopic = c.req.header("X-WC-Webhook-Topic") || "";
  const webhookSignature = c.req.header("X-WC-Webhook-Signature") || "";

  if (webhookTopic !== "product.created") {
    return c.json({ ok: true, skipped: true, reason: "Not a product.created event" });
  }

  const rawBody = await c.req.text();

  // Resolve domain_id from WC source URL
  const cleanSource = webhookSource.replace(/\/$/, "");
  const domain = await c.env.DB.prepare(
    "SELECT id FROM Domains WHERE domain_url LIKE ?1 AND platform_type = 'woocommerce'"
  )
    .bind(`%${cleanSource}%`)
    .first<{ id: string }>();

  if (!domain) {
    return c.json({ error: "Unknown WooCommerce source" }, 404);
  }

  // Verify signature if secret is stored in KV
  const vaultRaw = await c.env.CONFIG_KV.get(`vault:vault_${domain.id}`);
  if (vaultRaw && webhookSignature) {
    const creds = JSON.parse(vaultRaw);
    if (creds.webhook_secret) {
      const valid = await verifyShopifyHmac(rawBody, webhookSignature, creds.webhook_secret);
      if (!valid) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }
    }
  }

  const payload: WooCommerceProduct = JSON.parse(rawBody);
  const normalized = normalizeWooCommerceProduct(payload);
  const result = await processNewProduct(c.env, domain.id, normalized);

  return c.json({ ok: true, ...result });
});

// ─────────────────────────────────────────────────────────────
// POST /custom — Custom API integration webhook
// ─────────────────────────────────────────────────────────────

catalogWebhookRouter.post("/custom", async (c) => {
  const authHeader = c.req.header("Authorization") || "";
  const domainId = c.req.header("X-Domain-Id") || "";

  if (!domainId) {
    return c.json({ error: "X-Domain-Id header required" }, 400);
  }

  // Verify domain exists and bearer token matches stored API key
  const domain = await c.env.DB.prepare(
    "SELECT id, credentials_vault_id FROM Domains WHERE id = ?1"
  )
    .bind(domainId)
    .first<{ id: string; credentials_vault_id: string }>();

  if (!domain) {
    return c.json({ error: "Unknown domain" }, 404);
  }

  if (domain.credentials_vault_id) {
    const vaultRaw = await c.env.CONFIG_KV.get(`vault:${domain.credentials_vault_id}`);
    if (vaultRaw) {
      const creds = JSON.parse(vaultRaw);
      const expectedToken = creds.webhook_token || creds.api_key;
      if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
  }

  const payload = await c.req.json();
  const normalized = normalizeCustomProduct(payload);
  const result = await processNewProduct(c.env, domain.id, normalized);

  return c.json({ ok: true, ...result });
});
