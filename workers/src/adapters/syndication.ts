/**
 * ============================================================
 * Phase 49: Visual Semantic Broadcasting Adapter
 * ============================================================
 *
 * Background queue worker for `publishVisualAssets`.
 *
 * When Swarme publishes a new product or article, this adapter:
 *   1. Takes R2-hosted images (Phase 40)
 *   2. Generates a GEO-structured description (bullet points, JSON-LD)
 *   3. Pushes to:
 *      - Pinterest: Creates a new Pin via the Pinterest API
 *      - Google Merchant Center: Updates the product feed via
 *        Content API for Shopping
 *
 * All credential lookups use domain_id for compartmentalization.
 * ============================================================
 */

import type { Env } from "../index";
import { generateGeoSchema } from "../utils/schema";

// ── Types ────────────────────────────────────────────────────

export interface SyndicationAsset {
  id: string;
  domain_id: string;
  content_type: "product" | "article";
  title: string;
  description: string;
  image_url: string;          // R2 public URL
  page_url: string;           // Canonical page URL
  keywords: string[];
  // Product-specific
  price?: string;
  currency?: string;
  brand_name?: string;
  sku?: string;
  availability?: "in_stock" | "out_of_stock" | "preorder";
  google_product_category?: string;
  condition?: "new" | "refurbished" | "used";
}

interface CredentialRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

interface SyndicationResult {
  platform: string;
  success: boolean;
  external_id?: string;
  error?: string;
}

// ── Pinterest API Constants ──────────────────────────────────

const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
const GOOGLE_CONTENT_API_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";

// ─────────────────────────────────────────────────────────────
// Main Entry: Publish Visual Assets
// ─────────────────────────────────────────────────────────────

export async function publishVisualAssets(
  asset: SyndicationAsset,
  env: Env
): Promise<SyndicationResult[]> {
  const results: SyndicationResult[] = [];

  console.log(`[Syndication] Publishing "${asset.title}" (${asset.content_type}) for domain ${asset.domain_id}`);

  // 1. Generate GEO-optimized description
  const geoDescription = buildGeoDescription(asset);

  // 2. Push to Pinterest
  const pinterestResult = await publishToPinterest(asset, geoDescription, env);
  results.push(pinterestResult);

  // 3. Push to Google Merchant Center (products only)
  if (asset.content_type === "product") {
    const merchantResult = await publishToGoogleMerchant(asset, env);
    results.push(merchantResult);
  }

  // 4. Log syndication results to D1
  for (const result of results) {
    await logSyndicationEvent(asset, result, env);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// GEO Description Builder
// ─────────────────────────────────────────────────────────────

function buildGeoDescription(asset: SyndicationAsset): string {
  const bullets: string[] = [];

  // Lead with a definitive factual statement
  bullets.push(asset.description.split(".")[0] + ".");

  // Add keyword-rich bullet points
  if (asset.keywords.length > 0) {
    bullets.push(`Key features: ${asset.keywords.slice(0, 5).join(", ")}`);
  }

  if (asset.content_type === "product") {
    if (asset.price && asset.currency) {
      bullets.push(`Price: ${asset.currency} ${asset.price}`);
    }
    if (asset.brand_name) {
      bullets.push(`Brand: ${asset.brand_name}`);
    }
  }

  // Keep under 500 chars for Pinterest
  return bullets.join("\n").substring(0, 500);
}

// ─────────────────────────────────────────────────────────────
// Pinterest: Create Pin
// ─────────────────────────────────────────────────────────────

async function publishToPinterest(
  asset: SyndicationAsset,
  description: string,
  env: Env
): Promise<SyndicationResult> {
  // Fetch Pinterest credentials from Credentials_Vault
  const creds = await getCredentials(asset.domain_id, "pinterest", env);

  if (!creds) {
    return { platform: "pinterest", success: false, error: "No Pinterest credentials found" };
  }

  try {
    // Create a Pin via the Pinterest V5 API
    const pinPayload = {
      title: asset.title.substring(0, 100), // Pinterest title limit
      description: description,
      board_id: await getDefaultBoard(creds.access_token),
      media_source: {
        source_type: "image_url",
        url: asset.image_url,
      },
      link: asset.page_url,
      alt_text: `${asset.title} — ${asset.keywords.slice(0, 3).join(", ")}`,
    };

    const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.access_token}`,
      },
      body: JSON.stringify(pinPayload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[Syndication] Pinterest pin creation failed: ${res.status} — ${errBody}`);
      return { platform: "pinterest", success: false, error: `HTTP ${res.status}` };
    }

    const pinData = (await res.json()) as { id: string };
    console.log(`[Syndication] Pinterest pin created: ${pinData.id}`);

    return { platform: "pinterest", success: true, external_id: pinData.id };
  } catch (err) {
    console.error("[Syndication] Pinterest publish error:", err);
    return { platform: "pinterest", success: false, error: String(err) };
  }
}

/**
 * Get the user's first board as default target.
 * In production, this could be configurable per domain.
 */
async function getDefaultBoard(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`${PINTEREST_API_BASE}/boards`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = (await res.json()) as { items: Array<{ id: string; name: string }> };
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
    }
  } catch (err) {
    console.error("[Syndication] Failed to fetch Pinterest boards:", err);
  }

  // Fallback — board ID should be configured per domain
  return "default_board";
}

// ─────────────────────────────────────────────────────────────
// Google Merchant Center: Insert/Update Product
// ─────────────────────────────────────────────────────────────

async function publishToGoogleMerchant(
  asset: SyndicationAsset,
  env: Env
): Promise<SyndicationResult> {
  // Fetch Google credentials (shared with GSC — expanded scopes in Phase 49)
  const creds = await getCredentials(asset.domain_id, "google", env);

  if (!creds) {
    return { platform: "google_merchant", success: false, error: "No Google credentials found" };
  }

  // Refresh token if needed
  const accessToken = await getValidGoogleToken(creds, env);
  if (!accessToken) {
    return { platform: "google_merchant", success: false, error: "Token refresh failed" };
  }

  try {
    // Get Merchant Center account ID from KV config
    const merchantId = await env.CONFIG_KV.get(`domain:${asset.domain_id}:merchant_id`);
    if (!merchantId) {
      return { platform: "google_merchant", success: false, error: "No Merchant Center ID configured" };
    }

    const productPayload = {
      offerId: asset.sku || asset.id,
      title: asset.title,
      description: asset.description,
      link: asset.page_url,
      imageLink: asset.image_url,
      contentLanguage: "en",
      targetCountry: "US",
      channel: "online",
      availability: mapAvailability(asset.availability),
      condition: asset.condition || "new",
      price: asset.price && asset.currency ? {
        value: asset.price,
        currency: asset.currency,
      } : undefined,
      brand: asset.brand_name,
      googleProductCategory: asset.google_product_category,
    };

    const res = await fetch(
      `${GOOGLE_CONTENT_API_BASE}/${merchantId}/products`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(productPayload),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[Syndication] Google Merchant insert failed: ${res.status} — ${errBody}`);
      return { platform: "google_merchant", success: false, error: `HTTP ${res.status}` };
    }

    const productData = (await res.json()) as { id: string };
    console.log(`[Syndication] Google Merchant product inserted: ${productData.id}`);

    return { platform: "google_merchant", success: true, external_id: productData.id };
  } catch (err) {
    console.error("[Syndication] Google Merchant publish error:", err);
    return { platform: "google_merchant", success: false, error: String(err) };
  }
}

function mapAvailability(status?: string): string {
  switch (status) {
    case "in_stock": return "in stock";
    case "out_of_stock": return "out of stock";
    case "preorder": return "preorder";
    default: return "in stock";
  }
}

// ─────────────────────────────────────────────────────────────
// Credentials Helpers
// ─────────────────────────────────────────────────────────────

async function getCredentials(
  domainId: string,
  platform: string,
  env: Env
): Promise<CredentialRow | null> {
  const result = await env.DB.prepare(
    `SELECT access_token, refresh_token, expires_at
     FROM Credentials_Vault
     WHERE domain_id = ? AND platform = ?`
  )
    .bind(domainId, platform)
    .first<CredentialRow>();

  return result || null;
}

async function getValidGoogleToken(
  creds: CredentialRow,
  env: Env
): Promise<string | null> {
  // Check if current token is still valid
  if (creds.expires_at) {
    const expiresAt = new Date(creds.expires_at).getTime();
    if (expiresAt > Date.now() + 60000) {
      return creds.access_token;
    }
  }

  // Refresh the token
  if (!creds.refresh_token || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: creds.refresh_token,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { access_token: string; expires_in: number };
    return data.access_token;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Syndication Event Logger
// ─────────────────────────────────────────────────────────────

async function logSyndicationEvent(
  asset: SyndicationAsset,
  result: SyndicationResult,
  env: Env
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO Syndication_Log (domain_id, asset_id, platform, content_type, title, success, external_id, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        asset.domain_id,
        asset.id,
        result.platform,
        asset.content_type,
        asset.title,
        result.success ? 1 : 0,
        result.external_id || null,
        result.error || null,
      )
      .run();
  } catch (err) {
    console.error("[Syndication] Failed to log event:", err);
  }
}
