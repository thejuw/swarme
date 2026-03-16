// ─────────────────────────────────────────────────────────────
// GEO HTMLRewriter Middleware
// Injects JSON-LD structured data into <head> of HTML responses
// flowing through Cloudflare Workers edge.
// ─────────────────────────────────────────────────────────────

import { sanitizeJsonLd } from "./sanitizer";
import {
  generateGeoSchema,
  generateOrganizationSchema,
  generateBreadcrumbSchema,
  type SchemaContentType,
  type ArticlePayload,
  type FAQPagePayload,
  type ProductPayload,
  type HowToPayload,
  type WebPagePayload,
  type OrganizationPayload,
  type BreadcrumbItem,
} from "../utils/schema";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface GeoPageMeta {
  contentType: SchemaContentType;
  payload: ArticlePayload | FAQPagePayload | ProductPayload | HowToPayload | WebPagePayload;
  breadcrumbs?: BreadcrumbItem[];
  organization?: OrganizationPayload;
}

export interface GeoRewriterConfig {
  /** If provided, injects Organization schema on every page */
  defaultOrganization?: OrganizationPayload;
  /** If true, adds preconnect hints for common AI crawlers */
  addCrawlerHints?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Head Element Handler — injects JSON-LD into <head>
// ─────────────────────────────────────────────────────────────

class HeadElementHandler {
  private schemaScripts: string[];
  private crawlerHints: boolean;

  constructor(schemaScripts: string[], crawlerHints: boolean = false) {
    this.schemaScripts = schemaScripts;
    this.crawlerHints = crawlerHints;
  }

  element(element: HTMLRewriterTypes.Element) {
    // Inject all JSON-LD schema scripts at the end of <head> (sanitized)
    for (const script of this.schemaScripts) {
      const safeScript = sanitizeJsonLd(script);
      if (safeScript) {
        element.append(safeScript, { html: true });
      }
    }

    // Optional: Add meta tags for AI-engine discoverability
    if (this.crawlerHints) {
      element.append(
        `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">`,
        { html: true }
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Meta Description Handler — ensures proper meta description
// ─────────────────────────────────────────────────────────────

class MetaDescriptionHandler {
  private description: string;
  private found: boolean = false;

  constructor(description: string) {
    this.description = description;
  }

  element(element: HTMLRewriterTypes.Element) {
    const name = element.getAttribute("name");
    if (name === "description") {
      element.setAttribute("content", this.description);
      this.found = true;
    }
  }

  get wasFound() {
    return this.found;
  }
}

// ─────────────────────────────────────────────────────────────
// Main GEO Rewriter Function
// ─────────────────────────────────────────────────────────────

/**
 * Apply GEO HTMLRewriter transformations to an HTML response.
 * Injects JSON-LD structured data into the <head> element.
 *
 * Usage in a Cloudflare Worker route:
 *
 *   const pageMeta: GeoPageMeta = {
 *     contentType: "Article",
 *     payload: { headline: "...", ... }
 *   };
 *   return applyGeoRewriter(response, pageMeta, config);
 */
export function applyGeoRewriter(
  response: Response,
  pageMeta: GeoPageMeta,
  config?: GeoRewriterConfig
): Response {
  // Only rewrite HTML responses
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // Build JSON-LD scripts to inject
  const scripts: string[] = [];

  // 1. Primary content schema
  scripts.push(generateGeoSchema(pageMeta.contentType, pageMeta.payload as any));

  // 2. Breadcrumb schema (if provided)
  if (pageMeta.breadcrumbs && pageMeta.breadcrumbs.length > 0) {
    scripts.push(generateBreadcrumbSchema(pageMeta.breadcrumbs));
  }

  // 3. Organization schema (page-level override or config default)
  if (pageMeta.organization) {
    scripts.push(generateOrganizationSchema(pageMeta.organization));
  } else if (config?.defaultOrganization) {
    scripts.push(generateOrganizationSchema(config.defaultOrganization));
  }

  // Apply HTMLRewriter
  const rewriter = new HTMLRewriter()
    .on("head", new HeadElementHandler(scripts, config?.addCrawlerHints ?? false));

  return rewriter.transform(response);
}

// ─────────────────────────────────────────────────────────────
// Lightweight variant: inject raw JSON-LD string directly
// ─────────────────────────────────────────────────────────────

/**
 * Inject a pre-built JSON-LD string into an HTML response's <head>.
 * Useful when the schema was generated upstream (e.g., by an agent
 * or stored in D1) and needs to be injected at the edge.
 */
export function injectRawSchema(response: Response, jsonLdScript: string): Response {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const safeJsonLd = sanitizeJsonLd(jsonLdScript);
  if (!safeJsonLd) return response;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(safeJsonLd, { html: true });
      },
    })
    .transform(response);
}

// ─────────────────────────────────────────────────────────────
// Edge helper: build GeoPageMeta from D1 content row
// ─────────────────────────────────────────────────────────────

export interface D1ContentRow {
  id: string;
  title: string;
  slug: string;
  meta_description?: string;
  content_type: string; // "blog_post" | "product" | "faq" | "how_to" | "page"
  author_name?: string;
  published_at?: string;
  updated_at?: string;
  site_url: string;
  site_name: string;
  image_url?: string;
  // Product-specific
  price?: string;
  currency?: string;
  brand_name?: string;
  sku?: string;
  rating?: number;
  review_count?: number;
  // FAQ-specific
  faq_json?: string; // JSON array of { question, answer }
  // HowTo-specific
  steps_json?: string; // JSON array of { name, text, imageUrl? }
  total_time?: string;
}

/**
 * Convert a D1 content row into a GeoPageMeta for HTMLRewriter injection.
 * This maps internal content_type strings to schema.org types.
 */
export function buildGeoMetaFromContent(row: D1ContentRow): GeoPageMeta {
  const pageUrl = `${row.site_url}/${row.slug}`;

  switch (row.content_type) {
    case "blog_post":
    case "article":
      return {
        contentType: "Article",
        payload: {
          headline: row.title,
          description: row.meta_description || "",
          datePublished: row.published_at || new Date().toISOString(),
          dateModified: row.updated_at,
          authorName: row.author_name || row.site_name,
          imageUrl: row.image_url,
          publisherName: row.site_name,
          url: pageUrl,
        } as ArticlePayload,
        breadcrumbs: [
          { name: "Home", url: row.site_url },
          { name: "Blog", url: `${row.site_url}/blog` },
          { name: row.title, url: pageUrl },
        ],
      };

    case "product":
      return {
        contentType: "Product",
        payload: {
          name: row.title,
          description: row.meta_description || "",
          brand: row.brand_name || row.site_name,
          price: row.price || "0",
          priceCurrency: row.currency || "USD",
          sku: row.sku,
          imageUrl: row.image_url,
          url: pageUrl,
          ratingValue: row.rating,
          reviewCount: row.review_count,
        } as ProductPayload,
        breadcrumbs: [
          { name: "Home", url: row.site_url },
          { name: "Products", url: `${row.site_url}/products` },
          { name: row.title, url: pageUrl },
        ],
      };

    case "faq": {
      let faqs: { question: string; answer: string }[] = [];
      if (row.faq_json) {
        try { faqs = JSON.parse(row.faq_json); } catch { /* empty */ }
      }
      return {
        contentType: "FAQPage",
        payload: {
          title: row.title,
          faqs,
          url: pageUrl,
        } as FAQPagePayload,
      };
    }

    case "how_to": {
      let steps: { name: string; text: string; imageUrl?: string }[] = [];
      if (row.steps_json) {
        try { steps = JSON.parse(row.steps_json); } catch { /* empty */ }
      }
      return {
        contentType: "HowTo",
        payload: {
          name: row.title,
          description: row.meta_description || "",
          steps,
          totalTime: row.total_time,
          imageUrl: row.image_url,
          url: pageUrl,
        } as HowToPayload,
      };
    }

    default:
      return {
        contentType: "WebPage",
        payload: {
          name: row.title,
          description: row.meta_description || "",
          url: pageUrl,
          datePublished: row.published_at,
          dateModified: row.updated_at,
        } as WebPagePayload,
      };
  }
}
