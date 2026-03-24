/**
 * ============================================================
 * Phase 47: Universal CMS Adapter Factory
 * ============================================================
 *
 * Strategy Pattern implementation for normalizing interactions
 * with 13+ CMS/e-commerce platforms.
 *
 * Architecture:
 *   ICMSAdapter (interface)
 *     ├── WordPressAdapter    (WP REST API + Application Passwords)
 *     ├── WooCommerceAdapter  (Woo REST API v3)
 *     ├── MagentoAdapter      (Magento 2 REST API)
 *     ├── ShopifyAdapter      (Shopify Admin REST)
 *     ├── GhostAdapter        (Ghost Admin API)
 *     └── EdgeProxyAdapter    (Fallback for walled gardens)
 *
 * Walled gardens (Wix, Squarespace, Weebly, GoDaddy) cannot
 * accept backend API publishing, so EdgeProxyAdapter flags the
 * system to rely on Cloudflare HTMLRewriter for edge injection.
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PlatformType =
  | "wordpress"
  | "shopify"
  | "wix"
  | "squarespace"
  | "magento"
  | "woocommerce"
  | "ghost"
  | "joomla"
  | "drupal"
  | "prestashop"
  | "opencart"
  | "easywp"
  | "weebly"
  | "godaddy"
  | "contentful"
  | "custom";

export interface CMSCredentials {
  /** Platform-specific auth — keys vary by adapter */
  [key: string]: string;
}

export interface PublishArticleInput {
  title: string;
  htmlContent: string;
  metaDescription?: string;
  slug?: string;
  tags?: string[];
  featuredImageUrl?: string;
  status?: "draft" | "publish";
}

export interface PublishArticleResult {
  success: boolean;
  externalId?: string;
  url?: string;
  error?: string;
}

export interface UpdateProductInput {
  externalId: string;
  title?: string;
  description?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface UpdateProductResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface SitemapResult {
  success: boolean;
  urls: string[];
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Interface — The Strategy contract
// ─────────────────────────────────────────────────────────────

export interface ICMSAdapter {
  /** Human-readable platform name */
  readonly platformName: string;

  /** Whether this platform supports direct API publishing */
  readonly supportsDirectPublish: boolean;

  /** Publish a blog article / page */
  publishArticle(input: PublishArticleInput): Promise<PublishArticleResult>;

  /** Update product metadata (SEO fields) */
  updateProduct(input: UpdateProductInput): Promise<UpdateProductResult>;

  /** Fetch the sitemap URLs for crawl/audit */
  fetchSitemap(): Promise<SitemapResult>;
}

// ─────────────────────────────────────────────────────────────
// WordPress Adapter (WP REST API + Application Passwords)
// ─────────────────────────────────────────────────────────────

export class WordPressAdapter implements ICMSAdapter {
  readonly platformName = "WordPress";
  readonly supportsDirectPublish = true;

  private baseUrl: string;
  private authHeader: string;

  constructor(credentials: CMSCredentials) {
    this.baseUrl = credentials.site_url?.replace(/\/$/, "") || "";
    // Application Passwords: Basic Auth with username:app_password
    const encoded = btoa(`${credentials.username}:${credentials.app_password}`);
    this.authHeader = `Basic ${encoded}`;
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    try {
      const res = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify({
          title: input.title,
          content: input.htmlContent,
          status: input.status || "draft",
          slug: input.slug || "",
          excerpt: input.metaDescription || "",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `WP API ${res.status}: ${err}` };
      }

      const data = (await res.json()) as { id: number; link: string };
      return { success: true, externalId: String(data.id), url: data.link };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
    // WordPress core doesn't have products — delegate to WooCommerce
    return { success: false, error: "WordPress core does not support products. Use WooCommerce adapter." };
  }

  async fetchSitemap(): Promise<SitemapResult> {
    try {
      const res = await fetch(`${this.baseUrl}/wp-sitemap.xml`);
      if (!res.ok) {
        return { success: false, urls: [], error: `Sitemap fetch failed: ${res.status}` };
      }
      const xml = await res.text();
      // Extract <loc> URLs from sitemap index or sitemap
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// WooCommerce Adapter (Woo REST API v3)
// ─────────────────────────────────────────────────────────────

export class WooCommerceAdapter implements ICMSAdapter {
  readonly platformName = "WooCommerce";
  readonly supportsDirectPublish = true;

  private baseUrl: string;
  private authHeader: string;
  private wpAdapter: WordPressAdapter;

  constructor(credentials: CMSCredentials) {
    this.baseUrl = credentials.site_url?.replace(/\/$/, "") || "";
    // WooCommerce uses consumer_key + consumer_secret
    const encoded = btoa(`${credentials.consumer_key}:${credentials.consumer_secret}`);
    this.authHeader = `Basic ${encoded}`;
    // Delegate article publishing to WordPress
    this.wpAdapter = new WordPressAdapter(credentials);
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    return this.wpAdapter.publishArticle(input);
  }

  async updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
    try {
      const body: Record<string, string> = {};
      if (input.title) body.name = input.title;
      if (input.description) body.description = input.description;
      if (input.metaTitle) body.meta_data = JSON.stringify([{ key: "_yoast_wpseo_title", value: input.metaTitle }]);

      const res = await fetch(`${this.baseUrl}/wp-json/wc/v3/products/${input.externalId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `WooCommerce API ${res.status}: ${err}` };
      }

      return { success: true, externalId: input.externalId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchSitemap(): Promise<SitemapResult> {
    return this.wpAdapter.fetchSitemap();
  }
}

// ─────────────────────────────────────────────────────────────
// Magento Adapter (Magento 2 REST API)
// ─────────────────────────────────────────────────────────────

export class MagentoAdapter implements ICMSAdapter {
  readonly platformName = "Magento";
  readonly supportsDirectPublish = true;

  private baseUrl: string;
  private token: string;

  constructor(credentials: CMSCredentials) {
    this.baseUrl = credentials.site_url?.replace(/\/$/, "") || "";
    this.token = credentials.admin_token || "";
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    try {
      const res = await fetch(`${this.baseUrl}/rest/V1/cmsBlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          block: {
            identifier: input.slug || input.title.toLowerCase().replace(/\s+/g, "-"),
            title: input.title,
            content: input.htmlContent,
            active: input.status === "publish",
          },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Magento API ${res.status}: ${err}` };
      }

      const data = (await res.json()) as { id: number };
      return { success: true, externalId: String(data.id) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
    try {
      const body: Record<string, any> = { product: {} };
      if (input.title) body.product.name = input.title;
      if (input.description) body.product.custom_attributes = [
        { attribute_code: "description", value: input.description },
      ];
      if (input.metaTitle) {
        body.product.custom_attributes = [
          ...(body.product.custom_attributes || []),
          { attribute_code: "meta_title", value: input.metaTitle },
        ];
      }
      if (input.metaDescription) {
        body.product.custom_attributes = [
          ...(body.product.custom_attributes || []),
          { attribute_code: "meta_description", value: input.metaDescription },
        ];
      }

      const res = await fetch(`${this.baseUrl}/rest/V1/products/${encodeURIComponent(input.externalId)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Magento API ${res.status}: ${err}` };
      }

      return { success: true, externalId: input.externalId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchSitemap(): Promise<SitemapResult> {
    try {
      const res = await fetch(`${this.baseUrl}/sitemap.xml`);
      if (!res.ok) return { success: false, urls: [], error: `Sitemap fetch: ${res.status}` };
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Shopify Adapter (Shopify Admin REST)
// ─────────────────────────────────────────────────────────────

export class ShopifyAdapter implements ICMSAdapter {
  readonly platformName = "Shopify";
  readonly supportsDirectPublish = true;

  private shopDomain: string;
  private accessToken: string;
  private blogId: string;

  constructor(credentials: CMSCredentials) {
    this.shopDomain = credentials.shop_domain?.replace(/\/$/, "") || "";
    this.accessToken = credentials.access_token || "";
    this.blogId = credentials.blog_id || "";
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    try {
      const res = await fetch(
        `https://${this.shopDomain}/admin/api/2024-01/blogs/${this.blogId}/articles.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.accessToken,
          },
          body: JSON.stringify({
            article: {
              title: input.title,
              body_html: input.htmlContent,
              tags: input.tags?.join(", ") || "",
              published: input.status === "publish",
              summary_html: input.metaDescription || "",
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Shopify API ${res.status}: ${err}` };
      }

      const data = (await res.json()) as { article: { id: number; url: string } };
      return {
        success: true,
        externalId: String(data.article.id),
        url: `https://${this.shopDomain}/blogs/${this.blogId}/${input.slug || data.article.id}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateProduct(input: UpdateProductInput): Promise<UpdateProductResult> {
    try {
      const body: Record<string, any> = {};
      if (input.title) body.title = input.title;
      if (input.description) body.body_html = input.description;
      if (input.metaTitle) body.metafields_global_title_tag = input.metaTitle;
      if (input.metaDescription) body.metafields_global_description_tag = input.metaDescription;

      const res = await fetch(
        `https://${this.shopDomain}/admin/api/2024-01/products/${input.externalId}.json`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.accessToken,
          },
          body: JSON.stringify({ product: body }),
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Shopify API ${res.status}: ${err}` };
      }

      return { success: true, externalId: input.externalId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async fetchSitemap(): Promise<SitemapResult> {
    try {
      const res = await fetch(`https://${this.shopDomain}/sitemap.xml`);
      if (!res.ok) return { success: false, urls: [], error: `Sitemap: ${res.status}` };
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Ghost Adapter (Ghost Admin API)
// ─────────────────────────────────────────────────────────────

export class GhostAdapter implements ICMSAdapter {
  readonly platformName = "Ghost";
  readonly supportsDirectPublish = true;

  private baseUrl: string;
  private adminKey: string;

  constructor(credentials: CMSCredentials) {
    this.baseUrl = credentials.site_url?.replace(/\/$/, "") || "";
    this.adminKey = credentials.admin_api_key || "";
  }

  /**
   * Ghost Admin API uses a custom JWT derived from the admin key.
   * Key format: {id}:{secret} — we split and sign.
   */
  private async getJwtToken(): Promise<string> {
    const [id, secret] = this.adminKey.split(":");
    if (!id || !secret) return "";

    // Ghost JWT: header.payload signed with HMAC-SHA256
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }));
    const now = Math.floor(Date.now() / 1000);
    const payload = btoa(JSON.stringify({
      iat: now,
      exp: now + 300,
      aud: "/admin/",
    }));

    const signingInput = `${header}.${payload}`;
    const keyBytes = Uint8Array.from(
      (secret.match(/.{2}/g) || []).map((b) => parseInt(b, 16))
    );

    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    return `${header}.${payload}.${sigB64}`;
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    try {
      const token = await this.getJwtToken();
      const res = await fetch(`${this.baseUrl}/ghost/api/admin/posts/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Ghost ${token}`,
        },
        body: JSON.stringify({
          posts: [
            {
              title: input.title,
              html: input.htmlContent,
              status: input.status === "publish" ? "published" : "draft",
              slug: input.slug || undefined,
              meta_description: input.metaDescription || "",
              tags: input.tags?.map((t) => ({ name: t })) || [],
            },
          ],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `Ghost API ${res.status}: ${err}` };
      }

      const data = (await res.json()) as { posts: [{ id: string; url: string }] };
      return { success: true, externalId: data.posts[0].id, url: data.posts[0].url };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateProduct(_input: UpdateProductInput): Promise<UpdateProductResult> {
    return { success: false, error: "Ghost is a blog platform — product updates are not supported." };
  }

  async fetchSitemap(): Promise<SitemapResult> {
    try {
      const res = await fetch(`${this.baseUrl}/sitemap.xml`);
      if (!res.ok) return { success: false, urls: [], error: `Sitemap: ${res.status}` };
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Edge Proxy Adapter — Walled Garden Fallback
// ─────────────────────────────────────────────────────────────
// For Wix, Squarespace, Weebly, GoDaddy, and other walled
// gardens that do not expose publishing APIs. This adapter
// flags all operations to go through Cloudflare HTMLRewriter
// edge injection instead.
// ─────────────────────────────────────────────────────────────

export class EdgeProxyAdapter implements ICMSAdapter {
  readonly platformName: string;
  readonly supportsDirectPublish = false;

  private domainUrl: string;

  constructor(platform: string, credentials: CMSCredentials) {
    this.platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
    this.domainUrl = credentials.domain_url || credentials.site_url || "";
  }

  async publishArticle(_input: PublishArticleInput): Promise<PublishArticleResult> {
    return {
      success: false,
      error: `${this.platformName} does not expose a publishing API. ` +
        `Content changes will be applied via Cloudflare HTMLRewriter edge proxy. ` +
        `The domain must be routed through Cloudflare DNS.`,
    };
  }

  async updateProduct(_input: UpdateProductInput): Promise<UpdateProductResult> {
    return {
      success: false,
      error: `${this.platformName} does not expose a product update API. ` +
        `SEO modifications will be applied via HTMLRewriter at the edge.`,
    };
  }

  async fetchSitemap(): Promise<SitemapResult> {
    try {
      const sitemapUrl = this.domainUrl
        ? `${this.domainUrl.replace(/\/$/, "")}/sitemap.xml`
        : "";
      if (!sitemapUrl) return { success: false, urls: [], error: "No domain URL configured" };

      const res = await fetch(sitemapUrl);
      if (!res.ok) return { success: false, urls: [], error: `Sitemap: ${res.status}` };
      const xml = await res.text();
      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Factory — Resolves the correct adapter by platform type
// ─────────────────────────────────────────────────────────────

/** Platforms that are walled gardens (no backend publishing API) */
const WALLED_GARDENS: Set<string> = new Set([
  "wix", "squarespace", "weebly", "godaddy",
]);

// ─────────────────────────────────────────────────────────────────
// Contentful Adapter (Content Management API)
// ─────────────────────────────────────────────────────────────────

export class ContentfulAdapter implements ICMSAdapter {
  readonly platformName = "Contentful";
  readonly supportsDirectPublish = true;

  private spaceId: string;
  private envId: string;
  private accessToken: string;
  private contentTypeId: string;

  constructor(credentials: CMSCredentials) {
    this.spaceId = credentials.space_id || "";
    this.envId = credentials.environment_id || "master";
    this.accessToken = credentials.management_token || credentials.access_token || "";
    this.contentTypeId = credentials.content_type_id || "blogPost";
  }

  private get baseUrl(): string {
    return `https://api.contentful.com/spaces/${this.spaceId}/environments/${this.envId}`;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/vnd.contentful.management.v1+json",
    };
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    if (!this.spaceId || !this.accessToken) {
      return { success: false, error: "Contentful credentials not configured (space_id + management_token required)" };
    }

    try {
      // Step 1: Create entry
      const createRes = await fetch(`${this.baseUrl}/entries`, {
        method: "POST",
        headers: {
          ...this.headers,
          "X-Contentful-Content-Type": this.contentTypeId,
        },
        body: JSON.stringify({
          fields: {
            title: { "en-US": input.title },
            slug: { "en-US": input.slug || input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") },
            body: { "en-US": input.htmlContent },
            description: { "en-US": input.metaDescription || "" },
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return { success: false, error: `Contentful create failed (${createRes.status}): ${err.slice(0, 200)}` };
      }

      const entry = await createRes.json() as { sys: { id: string; version: number } };
      const entryId = entry.sys.id;

      // Step 2: Publish if status is "publish"
      if (input.status === "publish") {
        const pubRes = await fetch(`${this.baseUrl}/entries/${entryId}/published`, {
          method: "PUT",
          headers: {
            ...this.headers,
            "X-Contentful-Version": String(entry.sys.version),
          },
        });

        if (!pubRes.ok) {
          return {
            success: true,
            externalId: entryId,
            url: `https://app.contentful.com/spaces/${this.spaceId}/entries/${entryId}`,
            // Created but publish failed
          };
        }
      }

      return {
        success: true,
        externalId: entryId,
        url: `https://app.contentful.com/spaces/${this.spaceId}/entries/${entryId}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async updateProduct(_input: UpdateProductInput): Promise<UpdateProductResult> {
    return { success: false, error: "Contentful does not support product management. Use Shopify or WooCommerce." };
  }

  async fetchSitemap(): Promise<SitemapResult> {
    // Contentful doesn't serve a sitemap directly. Return entries as URLs.
    try {
      const res = await fetch(`${this.baseUrl}/entries?content_type=${this.contentTypeId}&limit=100`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) {
        return { success: false, urls: [], error: `Contentful entries fetch failed: ${res.status}` };
      }
      const data = await res.json() as { items: Array<{ sys: { id: string } }> };
      const urls = (data.items || []).map(
        (item) => `https://app.contentful.com/spaces/${this.spaceId}/entries/${item.sys.id}`
      );
      return { success: true, urls };
    } catch (err: any) {
      return { success: false, urls: [], error: err.message };
    }
  }
}

/**
 * Create the correct CMS adapter for a given platform.
 * Credentials are loaded from KV by credentials_vault_id before calling.
 */
export function createCMSAdapter(
  platform: PlatformType,
  credentials: CMSCredentials
): ICMSAdapter {
  // Walled gardens always get the edge proxy adapter
  if (WALLED_GARDENS.has(platform)) {
    return new EdgeProxyAdapter(platform, credentials);
  }

  switch (platform) {
    case "wordpress":
    case "joomla":
    case "drupal":
    case "easywp":
      // Joomla/Drupal/EasyWP use WP-compatible REST endpoints
      return new WordPressAdapter(credentials);

    case "woocommerce":
      return new WooCommerceAdapter(credentials);

    case "shopify":
      return new ShopifyAdapter(credentials);

    case "magento":
    case "prestashop":
    case "opencart":
      // PrestaShop/OpenCart share similar REST pattern — Magento as base
      return new MagentoAdapter(credentials);

    case "ghost":
      return new GhostAdapter(credentials);

    case "contentful":
      return new ContentfulAdapter(credentials);

    case "custom":
    default:
      // Custom sites get edge proxy treatment
      return new EdgeProxyAdapter(platform, credentials);
  }
}

/**
 * Load credentials from KV vault and return the adapter.
 * This is the main entry point for runtime use.
 */
export async function getAdapterForDomain(
  env: Env,
  platformType: PlatformType,
  vaultId: string
): Promise<ICMSAdapter> {
  let credentials: CMSCredentials = {};

  if (vaultId) {
    const raw = await env.CONFIG_KV.get(`vault:${vaultId}`);
    if (raw) {
      try {
        credentials = JSON.parse(raw);
      } catch {
        credentials = {};
      }
    }
  }

  return createCMSAdapter(platformType, credentials);
}
