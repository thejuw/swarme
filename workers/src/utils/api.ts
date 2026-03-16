/**
 * ============================================================
 * Swarme — Phase 7: External API Utility Module
 * ============================================================
 *
 * Handles all outbound network requests from the swarm:
 *   1. fetchResearchData()  — Perplexity API (SERP research)
 *   2. generateContent()    — OpenAI API (content drafting)
 *   3. pushToCMS()          — Generic webhook (CMS publishing)
 *   4. pushToShopify()      — Shopify Admin API (blog article)
 *
 * Design principles:
 *   - Every function is stateless and side-effect-free (no KV/D1)
 *   - Callers (the Durable Object) handle persistence and retries
 *   - Timeouts are enforced via AbortController
 *   - Errors are typed and propagated, never silently swallowed
 *   - All responses are parsed and validated before returning
 * ============================================================
 */

import { createThrottledFetch } from "./throttle";

// ─────────────────────────────────────────────────────────────
// Shared Types & Constants
// ─────────────────────────────────────────────────────────────

/** Thrown when an external API returns a non-OK status. */
export class ExternalAPIError extends Error {
  public readonly statusCode: number;
  public readonly provider: string;
  public readonly retryable: boolean;

  constructor(
    provider: string,
    statusCode: number,
    message: string,
    retryable = false
  ) {
    super(`[${provider}] HTTP ${statusCode}: ${message}`);
    this.name = "ExternalAPIError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/** Standard timeout for all external API calls (30s). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Status codes that indicate the request can be retried. */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Creates an AbortSignal that fires after `ms` milliseconds.
 * Uses the standard AbortSignal.timeout where available,
 * falls back to manual AbortController for older runtimes.
 */
function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}


// ─────────────────────────────────────────────────────────────
// 1. Perplexity API — SERP Research
// ─────────────────────────────────────────────────────────────

/**
 * Shape returned by fetchResearchData.
 * The DO's stepResearch() maps this into ResearchOutput.
 */
export interface PerplexityResearchResult {
  topCompetitors: string[];
  contentGaps: string[];
  semanticEntities: string[];
  suggestedAngle: string;
  rawCitations: string[];
  model: string;
}

/**
 * Calls the Perplexity Sonar API to analyze the competitive
 * landscape and semantic entities for a given keyword query.
 *
 * The system prompt instructs the model to return structured
 * JSON with competitor domains, content gaps, and semantic
 * entities — so the output can be programmatically parsed.
 *
 * @param query   — The target keyword or search query
 * @param apiKey  — Perplexity API bearer token
 * @returns Parsed research result
 * @throws ExternalAPIError if the API returns non-200
 */
export async function fetchResearchData(
  query: string,
  apiKey: string
): Promise<PerplexityResearchResult> {
  const throttledPerplexity = createThrottledFetch("perplexity", env.CONFIG_KV);
  const response = await throttledPerplexity("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content: [
            "You are a competitive SEO research analyst. Given a search query,",
            "analyze the top-ranking content and return a JSON object with exactly",
            "these keys (no markdown, no explanation, just valid JSON):",
            "",
            "{",
            '  "topCompetitors": ["domain1.com", "domain2.com", "domain3.com"],',
            '  "contentGaps": ["topic not covered by competitors", ...],',
            '  "semanticEntities": ["entity1", "entity2", ...],',
            '  "suggestedAngle": "one sentence describing the optimal content angle"',
            "}",
            "",
            "topCompetitors: the 3 domains ranking highest for this query.",
            "contentGaps: 2-4 subtopics competitors miss that would boost ranking.",
            "semanticEntities: 5-8 key entities/concepts search engines expect.",
            "suggestedAngle: a unique angle that differentiates from existing content.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Analyze the competitive landscape for the search query: "${query}"`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
      return_citations: true,
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "Perplexity",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    citations?: string[];
    model?: string;
  };

  const rawContent = data.choices?.[0]?.message?.content ?? "";
  const citations = data.citations ?? [];

  // Parse the JSON from the model's response
  let parsed: {
    topCompetitors?: string[];
    contentGaps?: string[];
    semanticEntities?: string[];
    suggestedAngle?: string;
  };

  try {
    // Extract JSON from the response — the model may wrap it in markdown
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in response");
    }
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // If parsing fails, return a degraded result rather than throwing
    parsed = {
      topCompetitors: [],
      contentGaps: [],
      semanticEntities: [],
      suggestedAngle: rawContent.slice(0, 200),
    };
  }

  return {
    topCompetitors: parsed.topCompetitors ?? [],
    contentGaps: parsed.contentGaps ?? [],
    semanticEntities: parsed.semanticEntities ?? [],
    suggestedAngle: parsed.suggestedAngle ?? "",
    rawCitations: citations,
    model: data.model ?? "sonar-pro",
  };
}


// ─────────────────────────────────────────────────────────────
// 2. OpenAI API — Content Generation
// ─────────────────────────────────────────────────────────────

/**
 * Brand guidelines injected into the content generation prompt.
 * Stored in KV under: vault:project:{projectId}:brand_guidelines
 */
export interface BrandGuidelines {
  tone: string;           // e.g. "authoritative yet approachable"
  audience: string;       // e.g. "technical decision-makers"
  vocabulary: string[];   // e.g. ["edge-native", "autonomous", "swarm"]
  avoidTerms: string[];   // e.g. ["cheap", "simple", "easy"]
  styleNotes: string;     // e.g. "Use short paragraphs. Data-backed claims."
}

/**
 * Shape returned by generateContent.
 * The DO's stepDraft() maps this into DraftOutput.
 */
export interface ContentGenerationResult {
  title: string;
  htmlContent: string;
  metaDescription: string;
  sections: string[];
  wordCount: number;
  model: string;
  tokensUsed: number;
}

/**
 * ISO 639-1 language display names for LLM prompting.
 * Keeps the prompt clear for the model ("French" not "fr").
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  sv: "Swedish",
  pl: "Polish",
  tr: "Turkish",
};

/**
 * Calls the OpenAI Chat Completions API to produce a full
 * SEO-optimized article draft. The system prompt dynamically
 * injects brand guidelines so output requires zero human editing.
 *
 * Phase 9: Supports multi-language generation. When targetLanguage
 * is a non-English ISO 639-1 code, the LLM is explicitly instructed
 * to produce the entire article natively in that language.
 *
 * @param context         — Research context (competitor analysis, gaps, entities)
 * @param brandGuidelines — Project's brand voice and style rules
 * @param apiKey          — OpenAI API bearer token
 * @param keyword         — Target keyword for SEO optimization
 * @param targetLanguage  — ISO 639-1 code (default: "en")
 * @returns Parsed content generation result
 * @throws ExternalAPIError if the API returns non-200
 */
export async function generateContent(
  context: string,
  brandGuidelines: BrandGuidelines,
  apiKey: string,
  keyword: string,
  targetLanguage: string = "en"
): Promise<ContentGenerationResult> {
  const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
  const isNonEnglish = targetLanguage !== "en";

  // Build the language instruction block (Phase 9)
  const languageBlock = isNonEnglish
    ? [
        "",
        "LANGUAGE REQUIREMENT (CRITICAL):",
        `  You MUST generate the entire article — including all headings, body text,`,
        `  FAQ questions, meta description, and call-to-action — natively in ${langName}.`,
        `  Do NOT translate from English. Write as a native ${langName} speaker would.`,
        `  Maintain the brand tone, but use localized colloquialisms and natural`,
        `  phrasing appropriate for ${langName}-speaking audiences.`,
        `  The JSON keys ("title", "htmlContent", etc.) must remain in English.`,
      ]
    : [];

  const systemPrompt = [
    "You are an expert SEO content writer. Generate a complete, publish-ready",
    "article in HTML format (using semantic tags: h1, h2, h3, p, ul, li, strong, em).",
    "",
    "BRAND VOICE GUIDELINES (follow exactly):",
    `  Tone: ${brandGuidelines.tone}`,
    `  Target audience: ${brandGuidelines.audience}`,
    `  Preferred vocabulary: ${brandGuidelines.vocabulary.join(", ")}`,
    `  Terms to avoid: ${brandGuidelines.avoidTerms.join(", ")}`,
    `  Style: ${brandGuidelines.styleNotes}`,
    ...languageBlock,
    "",
    "SEO REQUIREMENTS:",
    `  Primary keyword: "${keyword}"`,
    "  - Include the primary keyword in the H1, first paragraph, and at least 2 H2s.",
    "  - Use related semantic entities naturally throughout the content.",
    "  - Target 1.5-2.5% keyword density.",
    "  - Include an FAQ section with 3-4 questions using 'People Also Ask' style.",
    "  - End with a clear call-to-action.",
    "",
    "MEDIA PLACEHOLDERS (Phase 40):",
    "  Insert 2-4 `<media-placeholder>` tags at semantically appropriate positions",
    "  within the article body (NOT inside headings or list items).",
    "  Each tag must have a `description` attribute describing the ideal image:",
    '  Example: <media-placeholder description="Minimalist workspace with laptop showing SEO dashboard analytics" />',
    "  Guidelines:",
    "    - Place the first placeholder after the introductory paragraph.",
    "    - Place subsequent placeholders between major sections.",
    "    - Descriptions must be specific, visual, and relevant to the surrounding content.",
    "    - Do NOT use generic descriptions like 'stock photo' or 'illustration'.",
    "    - These will be replaced with AI-generated images in a downstream pipeline step.",
    "",
    "Return a JSON object with exactly these keys (no markdown wrapping):",
    "{",
    '  "title": "SEO-optimized H1 title",',
    '  "htmlContent": "<article>...full HTML content...</article>",',
    '  "metaDescription": "155-char meta description with keyword",',
    '  "sections": ["Section 1 Title", "Section 2 Title", ...]',
    "}",
  ].join("\n");

  const throttledOpenai = createThrottledFetch("openai", env.CONFIG_KV);
  const response = await throttledOpenai("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            `Write a comprehensive, SEO-optimized article about "${keyword}".`,
            "",
            "RESEARCH CONTEXT (use this to inform content):",
            context,
            "",
            "The article should be 1800-2500 words, authoritative, and",
            "structured for both human readers and search engine crawlers.",
          ].join("\n"),
        },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
    signal: createTimeoutSignal(60_000), // Content generation needs more time
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "OpenAI",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
    model?: string;
    usage?: { total_tokens: number };
  };

  const rawContent = data.choices?.[0]?.message?.content ?? "";

  let parsed: {
    title?: string;
    htmlContent?: string;
    metaDescription?: string;
    sections?: string[];
  };

  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: treat entire response as content
    parsed = {
      title: `${keyword} — Comprehensive Guide`,
      htmlContent: `<article><p>${rawContent}</p></article>`,
      metaDescription: `Everything you need to know about ${keyword}.`,
      sections: [],
    };
  }

  // Count words in the HTML content (strip tags)
  const plainText = (parsed.htmlContent ?? "").replace(/<[^>]*>/g, " ");
  const wordCount = plainText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  return {
    title: parsed.title ?? `${keyword} — Comprehensive Guide`,
    htmlContent: parsed.htmlContent ?? "",
    metaDescription:
      parsed.metaDescription ?? `Learn about ${keyword}. Updated for 2026.`,
    sections: parsed.sections ?? [],
    wordCount,
    model: data.model ?? "gpt-4o",
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}


// ─────────────────────────────────────────────────────────────
// 3. CMS Webhook — Content Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Payload sent to the CMS webhook endpoint.
 */
export interface CMSPublishPayload {
  title: string;
  slug: string;
  htmlContent: string;
  metaDescription: string;
  keyword: string;
  seoScore: number;
  status: "draft" | "published";
  publishedAt: string;
}

/**
 * Shape returned by pushToCMS.
 */
export interface CMSPublishResult {
  success: boolean;
  publishedUrl: string | null;
  cmsResponseId: string | null;
  statusCode: number;
}

/**
 * Pushes finalized content to a client's CMS via a generic
 * HTTP POST webhook. Supports any CMS with a REST endpoint
 * (Webflow, WordPress REST API, Contentful, Strapi, etc.).
 *
 * The webhook URL and API key are stored per-project in KV:
 *   vault:project:{projectId}:cms_webhook_url
 *   vault:project:{projectId}:cms_api_key
 *
 * @param payload    — The article content and metadata
 * @param webhookUrl — The CMS webhook endpoint URL
 * @param apiKey     — CMS authentication token
 * @returns Publish result with the live URL if available
 * @throws ExternalAPIError if the webhook returns non-2xx
 */
export async function pushToCMS(
  payload: CMSPublishPayload,
  webhookUrl: string,
  apiKey: string
): Promise<CMSPublishResult> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Swarme-Edge/0.4.0",
      "X-Swarme-Action": "auto-publish",
    },
    body: JSON.stringify({
      ...payload,
      _swarme: {
        version: "0.4.0",
        agent: "publisher",
        timestamp: new Date().toISOString(),
      },
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "CMS Webhook",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  // Try to parse a JSON response (most CMS APIs return one)
  let responseBody: {
    id?: string;
    url?: string;
    slug?: string;
    published_url?: string;
  } = {};

  try {
    responseBody = (await response.json()) as typeof responseBody;
  } catch {
    // Some webhooks return 200 with no body — that's fine
  }

  // Determine the published URL from the response
  const publishedUrl =
    responseBody.published_url ??
    responseBody.url ??
    (responseBody.slug ? `${new URL(webhookUrl).origin}/${responseBody.slug}` : null);

  return {
    success: true,
    publishedUrl,
    cmsResponseId: responseBody.id ?? null,
    statusCode: response.status,
  };
}


// ─────────────────────────────────────────────────────────────
// 4. Shopify Admin API — Blog Article Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Shape returned by pushToShopify.
 * Extends CMSPublishResult for consistency.
 */
export interface ShopifyPublishResult {
  success: boolean;
  articleId: number | null;
  publishedUrl: string | null;
  handle: string | null;
  statusCode: number;
}

/**
 * Publishes a blog article to a Shopify storefront via the
 * Admin REST API (2024-01). Maps the swarm's generated content
 * into Shopify's Article resource.
 *
 * The endpoint creates a new Article under the specified blog:
 *   POST /admin/api/2024-01/blogs/{blog_id}/articles.json
 *
 * Credentials are stored per-project in KV:
 *   vault:project:{projectId}:shopify_access_token
 *   config:project:{projectId}:settings → shopify_domain, shopify_blog_id
 *
 * @param payload     — The article content (title + HTML body + meta)
 * @param domain      — Shopify store domain (e.g. "store.myshopify.com")
 * @param blogId      — Numeric blog ID from Shopify admin
 * @param accessToken — Shopify Custom App Admin API access token
 * @returns Publish result with the live article URL
 * @throws ExternalAPIError if the API returns non-2xx
 */
export async function pushToShopify(
  payload: {
    title: string;
    htmlContent: string;
    metaDescription: string;
    keyword: string;
    author?: string;
    tags?: string[];
  },
  domain: string,
  blogId: string,
  accessToken: string
): Promise<ShopifyPublishResult> {
  // Sanitize domain — strip protocol if user included it
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const url = `https://${cleanDomain}/admin/api/2024-01/blogs/${blogId}/articles.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      "User-Agent": "Swarme-Edge/1.0.0",
    },
    body: JSON.stringify({
      article: {
        title: payload.title,
        body_html: payload.htmlContent,
        author: payload.author ?? "Swarme AI",
        tags: payload.tags?.join(", ") ?? payload.keyword,
        published: true,
        metafields: [
          {
            namespace: "seo",
            key: "description",
            value: payload.metaDescription,
            type: "single_line_text_field",
          },
          {
            namespace: "swarme",
            key: "keyword",
            value: payload.keyword,
            type: "single_line_text_field",
          },
        ],
      },
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "Shopify",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    article?: {
      id: number;
      handle: string;
      title: string;
      published_at: string;
    };
  };

  const article = data.article;
  const handle = article?.handle ?? null;

  // Construct the public-facing blog URL
  const publishedUrl = handle
    ? `https://${cleanDomain}/blogs/${blogId}/${handle}`
    : null;

  return {
    success: true,
    articleId: article?.id ?? null,
    publishedUrl,
    handle,
    statusCode: response.status,
  };
}


// ─────────────────────────────────────────────────────────────
// 5. WooCommerce REST API — Blog Post Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Shape returned by pushToWooCommerce.
 */
export interface WooCommercePublishResult {
  success: boolean;
  postId: number | null;
  publishedUrl: string | null;
  slug: string | null;
  statusCode: number;
}

/**
 * Publishes a blog post to a WordPress/WooCommerce site via the
 * WP REST API (v2). Maps the swarm's generated content into a
 * WordPress Post resource.
 *
 * Endpoint:
 *   POST /wp-json/wp/v2/posts
 *
 * Authentication uses Application Passwords (Base64-encoded).
 *
 * Credentials stored per-project in KV:
 *   vault:project:{projectId}:woocommerce_auth_token
 *   config:project:{projectId}:settings → woocommerce_domain
 *
 * @param payload   — Article content (title + HTML body + meta)
 * @param domain    — WooCommerce/WordPress site domain
 * @param authToken — Base64-encoded "username:application_password"
 * @returns Publish result with the live post URL
 * @throws ExternalAPIError if the API returns non-2xx
 */
export async function pushToWooCommerce(
  payload: {
    title: string;
    htmlContent: string;
    metaDescription: string;
    keyword: string;
    tags?: string[];
  },
  domain: string,
  authToken: string
): Promise<WooCommercePublishResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${cleanDomain}/wp-json/wp/v2/posts`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
      "User-Agent": "Swarme-Edge/1.0.0",
    },
    body: JSON.stringify({
      title: payload.title,
      content: payload.htmlContent,
      status: "publish",
      excerpt: payload.metaDescription,
      meta: {
        _swarme_keyword: payload.keyword,
      },
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "WooCommerce",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    id?: number;
    slug?: string;
    link?: string;
  };

  return {
    success: true,
    postId: data.id ?? null,
    publishedUrl: data.link ?? (data.slug ? `https://${cleanDomain}/${data.slug}` : null),
    slug: data.slug ?? null,
    statusCode: response.status,
  };
}


// ─────────────────────────────────────────────────────────────
// 6. BigCommerce — Blog Post Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Shape returned by pushToBigCommerce.
 */
export interface BigCommercePublishResult {
  success: boolean;
  postId: number | null;
  publishedUrl: string | null;
  statusCode: number;
}

/**
 * Publishes a blog post to a BigCommerce storefront via the
 * Management REST API (v2). Maps content into a Blog Post resource.
 *
 * Endpoint:
 *   POST /api/v2/blog/posts
 *
 * Credentials stored per-project in KV:
 *   vault:project:{projectId}:bigcommerce_access_token
 *   config:project:{projectId}:settings → bigcommerce_store_hash, bigcommerce_domain
 *
 * @param payload     — Article content (title + HTML body + meta)
 * @param storeHash   — BigCommerce store hash (e.g. "abc123")
 * @param accessToken — BigCommerce API access token
 * @param domain      — Public storefront domain for URL construction
 * @returns Publish result with the live post URL
 * @throws ExternalAPIError if the API returns non-2xx
 */
export async function pushToBigCommerce(
  payload: {
    title: string;
    htmlContent: string;
    metaDescription: string;
    keyword: string;
    tags?: string[];
  },
  storeHash: string,
  accessToken: string,
  domain?: string
): Promise<BigCommercePublishResult> {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/blog/posts`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Swarme-Edge/1.0.0",
    },
    body: JSON.stringify({
      title: payload.title,
      body: payload.htmlContent,
      is_published: true,
      meta_description: payload.metaDescription,
      meta_keywords: payload.tags?.join(",") ?? payload.keyword,
      published_date_iso8601: new Date().toISOString(),
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "BigCommerce",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    id?: number;
    url?: string;
  };

  const cleanDomain = domain?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const publishedUrl = data.url ?? (cleanDomain ? `https://${cleanDomain}/blog/` : null);

  return {
    success: true,
    postId: data.id ?? null,
    publishedUrl,
    statusCode: response.status,
  };
}


// ─────────────────────────────────────────────────────────────
// 7. Magento REST API — CMS Page/Blog Publishing
// ─────────────────────────────────────────────────────────────

/**
 * Shape returned by pushToMagento.
 */
export interface MagentoPublishResult {
  success: boolean;
  pageId: number | null;
  publishedUrl: string | null;
  identifier: string | null;
  statusCode: number;
}

/**
 * Publishes a CMS page to Magento 2 via the REST API.
 * Magento doesn't have a native blog; we use CMS pages.
 * (Store owners may also use Magefan Blog, Amasty, etc.
 * — this covers the core Magento CMS page endpoint.)
 *
 * Endpoint:
 *   POST /rest/V1/cmsPage
 *
 * Credentials stored per-project in KV:
 *   vault:project:{projectId}:magento_access_token
 *   config:project:{projectId}:settings → magento_domain
 *
 * @param payload     — Article content (title + HTML body + meta)
 * @param domain      — Magento 2 store domain
 * @param accessToken — Magento Integration/Admin Bearer token
 * @returns Publish result with the live page URL
 * @throws ExternalAPIError if the API returns non-2xx
 */
export async function pushToMagento(
  payload: {
    title: string;
    htmlContent: string;
    metaDescription: string;
    keyword: string;
  },
  domain: string,
  accessToken: string
): Promise<MagentoPublishResult> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const identifier = payload.keyword.replace(/\s+/g, "-").toLowerCase();
  const url = `https://${cleanDomain}/rest/V1/cmsPage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": "Swarme-Edge/1.0.0",
    },
    body: JSON.stringify({
      page: {
        title: payload.title,
        identifier,
        content: payload.htmlContent,
        active: true,
        meta_title: payload.title,
        meta_description: payload.metaDescription,
        meta_keywords: payload.keyword,
      },
    }),
    signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "No response body");
    throw new ExternalAPIError(
      "Magento",
      response.status,
      body.slice(0, 500),
      RETRYABLE_STATUS_CODES.has(response.status)
    );
  }

  const data = (await response.json()) as {
    id?: number;
    identifier?: string;
  };

  const publishedUrl = data.identifier
    ? `https://${cleanDomain}/${data.identifier}`
    : `https://${cleanDomain}/${identifier}`;

  return {
    success: true,
    pageId: data.id ?? null,
    publishedUrl,
    identifier: data.identifier ?? identifier,
    statusCode: response.status,
  };
}
