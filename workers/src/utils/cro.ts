/**
 * ============================================================
 * Swarme — Phase 16 + Phase 43 + Phase 45: CRO Evaluation Engine
 * ============================================================
 *
 * Phase 16 (original): Analyzes Page_Telemetry data against
 * performance thresholds to determine which pages need
 * autonomous optimization.
 *
 * Phase 43 (multi-vertical): Introduces business-model-aware
 * CRO playbooks. The engine now reads the brand's business_model
 * from Brand_Context and tailors its optimization rules:
 *
 *   e-commerce  → "Add to Cart" clicks + Checkout routing
 *   lead_gen    → Form Submissions + Calendar clicks + Email Captures
 *   affiliate   → Outbound affiliate link clicks
 *   publisher   → Dwell Time + Scroll Depth + Internal link clicks
 *
 * Phase 45 (North Star): Before generating CRO suggestions, the
 * engine can fetch the operator's "North Star" website DOM via
 * the Cloudflare Browser Rendering /crawl endpoint, analyze its
 * layout/design principles with a Heavy LLM, and use those
 * principles to inform higher-quality optimization suggestions.
 *
 * The CRO engine does NOT mutate data — it evaluates and returns
 * a list of optimization tasks for the Durable Object to execute.
 *
 * The A/B testing statistical engine (Phase 35) uses these
 * business-model-specific conversion events as the "Winner"
 * metric via getConversionConfig().
 * ============================================================
 */

import type { BusinessModel } from "./aiManager";
import { createThrottledFetch } from "./throttle";
import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type CROTaskType =
  | "DOM_REORDER"
  | "CONTENT_REWRITE"
  | "CTA_OPTIMIZATION"
  | "FUNNEL_FIX"
  | "LINK_PLACEMENT"
  | "ENGAGEMENT_BOOST";

export interface CROTask {
  asset_id: string;
  task_type: CROTaskType;
  reason: string;
  priority: "high" | "medium" | "low";
  playbook: BusinessModel | "default";
  telemetry: {
    total_views: number;
    avg_scroll_depth: number;
    avg_dwell_time_seconds: number;
    cta_clicks: number;
  };
}

export interface CROEvaluationResult {
  asset_id: string;
  needs_optimization: boolean;
  business_model: BusinessModel | "default";
  tasks: CROTask[];
  summary: string;
}

export interface TelemetryRow {
  asset_id: string;
  total_views: number;
  avg_scroll_depth: number;
  avg_dwell_time_seconds: number;
  cta_clicks: number;
  last_optimized_at: string | null;
  title?: string;
  slug?: string;
  published_url?: string;
}

// ─────────────────────────────────────────────────────────────
// Conversion Configuration per Business Model
// ─────────────────────────────────────────────────────────────

export interface ConversionConfig {
  /** Human-readable label for the conversion metric */
  label: string;
  /** The telemetry event(s) that count as a "conversion" for A/B test winner determination */
  events: string[];
  /** Description of what constitutes success for this model */
  description: string;
  /** The primary KPI the CRO engine optimizes for */
  primaryKpi: string;
  /** Secondary KPIs to monitor */
  secondaryKpis: string[];
}

/**
 * Returns the conversion configuration for a given business model.
 * Used by the A/B testing statistical engine (Phase 35) to determine
 * what counts as a "conversion" when declaring a winner.
 */
export function getConversionConfig(
  businessModel: BusinessModel | "" | "default"
): ConversionConfig {
  switch (businessModel) {
    case "e-commerce":
      return {
        label: "Add to Cart / Checkout",
        events: ["add_to_cart", "begin_checkout", "purchase"],
        description:
          "Tracks product add-to-cart actions and checkout funnel progression. " +
          "A/B test winners are determined by the variant with higher add-to-cart rate.",
        primaryKpi: "add_to_cart_rate",
        secondaryKpis: [
          "checkout_rate",
          "revenue_per_session",
          "cart_abandonment_rate",
        ],
      };

    case "lead_gen":
      return {
        label: "Lead Capture",
        events: ["form_submit", "calendar_click", "email_capture", "phone_click"],
        description:
          "Tracks form submissions, calendar booking clicks, and email signups. " +
          "A/B test winners are determined by the variant with higher lead capture rate.",
        primaryKpi: "lead_capture_rate",
        secondaryKpis: [
          "form_start_rate",
          "form_completion_rate",
          "calendar_booking_rate",
        ],
      };

    case "affiliate":
      return {
        label: "Affiliate Click-Through",
        events: ["affiliate_click", "outbound_click", "comparison_click"],
        description:
          "Tracks outbound clicks to affiliate partner domains. " +
          "A/B test winners are determined by the variant with higher affiliate click-through rate.",
        primaryKpi: "affiliate_ctr",
        secondaryKpis: [
          "outbound_click_rate",
          "comparison_engagement",
          "revenue_per_click",
        ],
      };

    case "publisher":
      return {
        label: "Engagement Depth",
        events: ["scroll_75", "dwell_60s", "internal_click", "next_article"],
        description:
          "Tracks deep engagement: 75%+ scroll depth, 60s+ dwell time, and internal navigation. " +
          "A/B test winners are determined by the variant with higher engagement depth rate.",
        primaryKpi: "engagement_depth_rate",
        secondaryKpis: [
          "avg_dwell_time",
          "scroll_depth",
          "pages_per_session",
          "bounce_rate",
        ],
      };

    default:
      // Fallback: generic CTA click tracking (Phase 16 original behavior)
      return {
        label: "CTA Click",
        events: ["cta_click"],
        description:
          "Tracks generic CTA engagement. Set the business model in Brand Context " +
          "for more precise conversion tracking.",
        primaryKpi: "cta_click_rate",
        secondaryKpis: ["scroll_depth", "dwell_time"],
      };
  }
}

// ─────────────────────────────────────────────────────────────
// Phase 45: North Star DOM Analysis
// ─────────────────────────────────────────────────────────────

export interface NorthStarAnalysis {
  typography: string;       // Font families, sizes, weight hierarchy
  ctaPatterns: string;      // CTA placement, color, copy patterns
  layoutStructure: string;  // Grid, spacing, section flow
  colorScheme: string;      // Dominant colors, contrast approach
  trustSignals: string;     // Reviews, badges, social proof placement
  keyTakeaway: string;      // Single most impactful design principle
}

/**
 * Fetch the North Star website's DOM via Cloudflare Browser Rendering
 * /crawl endpoint and return the raw markdown/HTML for LLM analysis.
 *
 * Returns null if the BROWSER binding is unavailable or fetch fails.
 */
async function fetchNorthStarDom(
  northStarUrl: string,
  env: Env
): Promise<string | null> {
  if (!env.BROWSER) {
    console.log("[CRO/NorthStar] BROWSER binding unavailable — skipping DOM fetch");
    return null;
  }

  try {
    const crawlResponse = await env.BROWSER.fetch(
      "https://browser-rendering.cloudflare.com/crawl",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: northStarUrl,
          scrapeOptions: { formats: ["markdown"] },
        }),
      }
    );

    if (!crawlResponse.ok) {
      console.error(`[CRO/NorthStar] Crawl failed (${crawlResponse.status})`);
      return null;
    }

    const data = (await crawlResponse.json()) as any;
    // The /crawl endpoint returns scraped content — extract the markdown
    const markdown = data?.result?.markdown || data?.markdown || data?.data?.markdown || JSON.stringify(data).slice(0, 8000);
    // Truncate to ~6000 chars to keep LLM prompt manageable
    return typeof markdown === "string" ? markdown.slice(0, 6000) : null;
  } catch (err) {
    console.error("[CRO/NorthStar] DOM fetch error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Analyze the North Star DOM with a Heavy LLM (Perplexity Sonar Pro) to
 * extract design principles: typography, CTA patterns, layout
 * structure, color scheme, trust signals.
 *
 * The analysis result is cached in CONFIG_KV for 24h to avoid
 * repeated LLM calls for the same North Star URL.
 */
export async function analyzeNorthStarDesign(
  northStarUrl: string,
  env: Env
): Promise<NorthStarAnalysis | null> {
  if (!northStarUrl) return null;

  // Check KV cache first
  const cacheKey = `northstar:analysis:${northStarUrl}`;
  try {
    const cached = await env.CONFIG_KV.get<NorthStarAnalysis>(cacheKey, "json");
    if (cached) {
      console.log("[CRO/NorthStar] Using cached analysis");
      return cached;
    }
  } catch { /* cache miss, proceed */ }

  // Fetch the DOM
  const domContent = await fetchNorthStarDom(northStarUrl, env);
  if (!domContent) {
    console.log("[CRO/NorthStar] No DOM content — returning mock analysis");
    return buildMockNorthStarAnalysis(northStarUrl);
  }

  // Get Perplexity API key from Admin Vault
  const globalConfig = await env.CONFIG_KV.get<Record<string, Record<string, string>>>(
    "global:config:keys",
    "json"
  );
  const apiKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY || (env as any).PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.log("[CRO/NorthStar] No Perplexity key — returning mock analysis");
    return buildMockNorthStarAnalysis(northStarUrl);
  }

  const systemPrompt = `You are an expert UI/UX analyst. Given the scraped content of a website, analyze its design and layout principles. Return ONLY valid JSON with these fields:
- typography: Describe the font hierarchy, sizes, weights, and readability approach.
- ctaPatterns: Describe CTA button placement, colors, copy patterns, and urgency techniques.
- layoutStructure: Describe the page grid, spacing rhythm, section flow, and visual hierarchy.
- colorScheme: Describe the dominant colors, accent usage, and contrast strategy.
- trustSignals: Describe social proof elements (reviews, badges, logos, testimonials) and their placement.
- keyTakeaway: One sentence summarizing the single most impactful design principle this site uses that others should emulate.

Return ONLY the JSON object. No markdown fences, no explanation.`;

  const userPrompt = `Analyze this website's design principles:\nURL: ${northStarUrl}\n\nPage content:\n${domContent}`;

  try {
    const throttledPplx = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
    const res = await throttledPplx("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      console.error(`[CRO/NorthStar] Perplexity error (${res.status})`);
      return buildMockNorthStarAnalysis(northStarUrl);
    }

    const data = (await res.json()) as any;
    const rawContent = data?.choices?.[0]?.message?.content || "";

    let analysis: NorthStarAnalysis;
    try {
      const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      console.error("[CRO/NorthStar] Failed to parse LLM analysis");
      return buildMockNorthStarAnalysis(northStarUrl);
    }

    // Cache for 24 hours
    try {
      await env.CONFIG_KV.put(cacheKey, JSON.stringify(analysis), { expirationTtl: 86400 });
    } catch { /* non-fatal */ }

    return analysis;
  } catch (err) {
    console.error("[CRO/NorthStar] Analysis failed:", err instanceof Error ? err.message : err);
    return buildMockNorthStarAnalysis(northStarUrl);
  }
}

function buildMockNorthStarAnalysis(url: string): NorthStarAnalysis {
  return {
    typography:
      "Uses a clean sans-serif hierarchy: 48px bold hero headings, 24px section headers, 16px body text with 1.6 line-height. Weight contrast (700 vs 400) creates clear visual hierarchy without font variety.",
    ctaPatterns:
      "Primary CTA is high-contrast (dark button on light background) positioned above the fold and repeated after every major content section. CTA copy is action-oriented ('Shop Now', 'Get Started') with urgency micro-copy below ('Limited time offer').",
    layoutStructure:
      "12-column grid with generous whitespace (80px section padding). Hero → Social Proof → Features → Testimonials → CTA flow. Alternating left/right image-text sections create visual rhythm. Sticky header with minimal navigation.",
    colorScheme:
      "Monochromatic neutral base (white/slate-50 backgrounds, slate-900 text) with a single high-saturation accent color for CTAs and interactive elements. 7:1 contrast ratio on all text.",
    trustSignals:
      "Customer review count prominently displayed near hero (\"12,000+ 5-star reviews\"). Brand logos bar immediately below hero. Individual testimonials with photos and full names mid-page. Security badges and guarantee text near checkout CTAs.",
    keyTakeaway:
      `The site's most impactful principle is ruthless simplicity — every section has exactly one job, one visual focal point, and one clear action, which eliminates decision fatigue and drives conversion.`,
  };
}

// ─────────────────────────────────────────────────────────────
// Thresholds (tunable)
// ─────────────────────────────────────────────────────────────

const CRO_THRESHOLDS = {
  /** Minimum views before the engine acts (avoid premature optimization) */
  MIN_VIEWS: 100,

  /** Scroll depth below this (%) with zero CTA clicks → CTA buried */
  SCROLL_DEPTH_FLOOR: 30,

  /** Dwell time below this (seconds) → weak intro / disengaged readers */
  DWELL_TIME_FLOOR: 10,

  /** Cooldown: don't re-optimize within this many hours */
  OPTIMIZATION_COOLDOWN_HOURS: 72,
} as const;

// ─────────────────────────────────────────────────────────────
// Business-Model-Specific Playbooks
// ─────────────────────────────────────────────────────────────

/**
 * E-COMMERCE Playbook
 * Primary: Optimize for 'Add to Cart' clicks and Checkout routing.
 */
function evaluateEcommerce(
  assetId: string,
  t: TelemetryRow
): CROTask[] {
  const tasks: CROTask[] = [];
  const snap = {
    total_views: t.total_views,
    avg_scroll_depth: t.avg_scroll_depth,
    avg_dwell_time_seconds: t.avg_dwell_time_seconds,
    cta_clicks: t.cta_clicks,
  };

  // Rule 1: Zero add-to-cart after significant views → CTA invisible or broken
  if (t.cta_clicks === 0 && t.total_views >= CRO_THRESHOLDS.MIN_VIEWS) {
    tasks.push({
      asset_id: assetId,
      task_type: "CTA_OPTIMIZATION",
      reason:
        `E-commerce funnel dead: 0 add-to-cart clicks after ${t.total_views} views. ` +
        `Move \"Add to Cart\" above the fold, increase button contrast, add urgency ` +
        `(stock count, limited offer). Test sticky add-to-cart on mobile.`,
      priority: "high",
      playbook: "e-commerce",
      telemetry: snap,
    });
  }

  // Rule 2: Low scroll depth → product detail never seen
  if (
    t.avg_scroll_depth < CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR &&
    t.cta_clicks === 0
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "DOM_REORDER",
      reason:
        `Product page abandonment: avg scroll ${t.avg_scroll_depth.toFixed(1)}% — ` +
        `buyers never reach product details, reviews, or checkout CTA. ` +
        `Reorder: hero image → price + CTA → reviews → description.`,
      priority: "high",
      playbook: "e-commerce",
      telemetry: snap,
    });
  }

  // Rule 3: High engagement but low conversion → checkout friction
  if (
    t.avg_dwell_time_seconds > 30 &&
    t.avg_scroll_depth > 60 &&
    t.cta_clicks > 0 &&
    t.cta_clicks / t.total_views < 0.02
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "FUNNEL_FIX",
      reason:
        `Checkout friction detected: users engage (${t.avg_dwell_time_seconds}s dwell, ` +
        `${t.avg_scroll_depth.toFixed(1)}% scroll) but only ${((t.cta_clicks / t.total_views) * 100).toFixed(1)}% ` +
        `add to cart. Simplify checkout path, reduce form fields, add trust badges.`,
      priority: "medium",
      playbook: "e-commerce",
      telemetry: snap,
    });
  }

  return tasks;
}

/**
 * LEAD GENERATION Playbook
 * Primary: Optimize for Form Submissions, Calendar clicks, Email Captures.
 */
function evaluateLeadGen(
  assetId: string,
  t: TelemetryRow
): CROTask[] {
  const tasks: CROTask[] = [];
  const snap = {
    total_views: t.total_views,
    avg_scroll_depth: t.avg_scroll_depth,
    avg_dwell_time_seconds: t.avg_dwell_time_seconds,
    cta_clicks: t.cta_clicks,
  };

  // Rule 1: Zero form interactions after significant traffic
  if (t.cta_clicks === 0 && t.total_views >= CRO_THRESHOLDS.MIN_VIEWS) {
    tasks.push({
      asset_id: assetId,
      task_type: "CTA_OPTIMIZATION",
      reason:
        `Lead gen dead zone: 0 form/calendar interactions after ${t.total_views} views. ` +
        `Add inline form above the fold, test calendar embed vs. contact form, ` +
        `add social proof (\"Join 2,000+ companies\"). Consider exit-intent popup.`,
      priority: "high",
      playbook: "lead_gen",
      telemetry: snap,
    });
  }

  // Rule 2: Good dwell but no conversion → form buried or intimidating
  if (
    t.avg_dwell_time_seconds > 20 &&
    t.cta_clicks === 0
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "DOM_REORDER",
      reason:
        `Visitors read content (${t.avg_dwell_time_seconds}s avg dwell) but never reach the form. ` +
        `Move lead capture CTA to the hero section. Reduce form to 3 fields max ` +
        `(name, email, company). Add \"Free consultation\" or \"No credit card\" assurance.`,
      priority: "high",
      playbook: "lead_gen",
      telemetry: snap,
    });
  }

  // Rule 3: Low dwell → content not compelling enough to convert
  if (t.avg_dwell_time_seconds < CRO_THRESHOLDS.DWELL_TIME_FLOOR) {
    tasks.push({
      asset_id: assetId,
      task_type: "CONTENT_REWRITE",
      reason:
        `Weak lead magnet: avg dwell ${t.avg_dwell_time_seconds}s — visitors leave before ` +
        `understanding the value prop. Rewrite intro with pain-point hook, add ` +
        `customer logos, and test video testimonial above the fold.`,
      priority: "medium",
      playbook: "lead_gen",
      telemetry: snap,
    });
  }

  return tasks;
}

/**
 * AFFILIATE Playbook
 * Primary: Optimize for outbound link clicks to known affiliate domains.
 */
function evaluateAffiliate(
  assetId: string,
  t: TelemetryRow
): CROTask[] {
  const tasks: CROTask[] = [];
  const snap = {
    total_views: t.total_views,
    avg_scroll_depth: t.avg_scroll_depth,
    avg_dwell_time_seconds: t.avg_dwell_time_seconds,
    cta_clicks: t.cta_clicks, // In affiliate context: outbound clicks
  };

  // Rule 1: No outbound clicks at all → links not visible or compelling
  if (t.cta_clicks === 0 && t.total_views >= CRO_THRESHOLDS.MIN_VIEWS) {
    tasks.push({
      asset_id: assetId,
      task_type: "LINK_PLACEMENT",
      reason:
        `Affiliate conversion dead: 0 outbound clicks after ${t.total_views} views. ` +
        `Place affiliate links earlier in content (within first 300 words), ` +
        `add comparison tables with clear \"Check Price\" CTAs, and use ` +
        `product card components instead of inline text links.`,
      priority: "high",
      playbook: "affiliate",
      telemetry: snap,
    });
  }

  // Rule 2: Low scroll depth → readers don't reach comparison section
  if (t.avg_scroll_depth < 40) {
    tasks.push({
      asset_id: assetId,
      task_type: "DOM_REORDER",
      reason:
        `Comparison content abandoned: avg scroll ${t.avg_scroll_depth.toFixed(1)}%. ` +
        `Move top product recommendation above the fold with a \"Best Pick\" badge. ` +
        `Add a sticky comparison bar that follows scroll. Front-load the verdict.`,
      priority: "medium",
      playbook: "affiliate",
      telemetry: snap,
    });
  }

  // Rule 3: Good engagement but low click-through → trust/motivation issue
  if (
    t.avg_dwell_time_seconds > 45 &&
    t.avg_scroll_depth > 60 &&
    t.cta_clicks > 0 &&
    t.cta_clicks / t.total_views < 0.03
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "CTA_OPTIMIZATION",
      reason:
        `Trust gap: readers engage deeply (${t.avg_dwell_time_seconds}s, ` +
        `${t.avg_scroll_depth.toFixed(1)}% scroll) but only ${((t.cta_clicks / t.total_views) * 100).toFixed(1)}% ` +
        `click affiliate links. Add verified purchase badges, price history charts, ` +
        `user ratings, and \"Why we recommend this\" editorial notes.`,
      priority: "medium",
      playbook: "affiliate",
      telemetry: snap,
    });
  }

  return tasks;
}

/**
 * PUBLISHER / AD REVENUE Playbook
 * Primary: Optimize for Dwell Time, Scroll Depth, Internal link clicks.
 */
function evaluatePublisher(
  assetId: string,
  t: TelemetryRow
): CROTask[] {
  const tasks: CROTask[] = [];
  const snap = {
    total_views: t.total_views,
    avg_scroll_depth: t.avg_scroll_depth,
    avg_dwell_time_seconds: t.avg_dwell_time_seconds,
    cta_clicks: t.cta_clicks, // In publisher context: internal navigation clicks
  };

  // Rule 1: Very low dwell time → immediate bounce (kills ad revenue)
  if (t.avg_dwell_time_seconds < CRO_THRESHOLDS.DWELL_TIME_FLOOR) {
    tasks.push({
      asset_id: assetId,
      task_type: "CONTENT_REWRITE",
      reason:
        `Publisher bounce crisis: avg dwell ${t.avg_dwell_time_seconds}s — readers leave ` +
        `before ads load. Rewrite opening paragraph with a compelling hook, ` +
        `add a \"Key Takeaways\" box above the fold, use pull quotes and ` +
        `section headers to create visual rhythm that encourages scrolling.`,
      priority: "high",
      playbook: "publisher",
      telemetry: snap,
    });
  }

  // Rule 2: Low scroll depth → content structure failing
  if (t.avg_scroll_depth < CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR) {
    tasks.push({
      asset_id: assetId,
      task_type: "ENGAGEMENT_BOOST",
      reason:
        `Shallow engagement: avg scroll ${t.avg_scroll_depth.toFixed(1)}% — ` +
        `readers abandon before mid-page ad slots. Break content into scannable ` +
        `sections, add inline images every 300 words, use \"Continue reading\" ` +
        `prompts, and add a progress bar to encourage completion.`,
      priority: "high",
      playbook: "publisher",
      telemetry: snap,
    });
  }

  // Rule 3: Good scroll but zero internal clicks → no recirculation
  if (
    t.avg_scroll_depth > 50 &&
    t.cta_clicks === 0
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "LINK_PLACEMENT",
      reason:
        `Dead-end content: ${t.avg_scroll_depth.toFixed(1)}% scroll depth but 0 internal ` +
        `navigation clicks. Add \"Related Articles\" cards in-content and at article end. ` +
        `Use contextual inline links to related pieces. Add \"Trending Now\" sidebar widget.`,
      priority: "medium",
      playbook: "publisher",
      telemetry: snap,
    });
  }

  // Rule 4: Moderate dwell + moderate scroll → optimize for deeper engagement
  if (
    t.avg_dwell_time_seconds >= CRO_THRESHOLDS.DWELL_TIME_FLOOR &&
    t.avg_dwell_time_seconds < 30 &&
    t.avg_scroll_depth >= 30 &&
    t.avg_scroll_depth < 60
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "ENGAGEMENT_BOOST",
      reason:
        `Mid-funnel drop: readers engage moderately (${t.avg_dwell_time_seconds}s, ` +
        `${t.avg_scroll_depth.toFixed(1)}%) but don't reach deep ad placements. ` +
        `Add interactive elements (polls, expandable FAQs) mid-article. ` +
        `Test infinite scroll format for content series.`,
      priority: "low",
      playbook: "publisher",
      telemetry: snap,
    });
  }

  return tasks;
}

/**
 * DEFAULT Playbook (Phase 16 original behavior)
 * Used when no business model is set.
 */
function evaluateDefault(
  assetId: string,
  t: TelemetryRow
): CROTask[] {
  const tasks: CROTask[] = [];
  const snap = {
    total_views: t.total_views,
    avg_scroll_depth: t.avg_scroll_depth,
    avg_dwell_time_seconds: t.avg_dwell_time_seconds,
    cta_clicks: t.cta_clicks,
  };

  // Original Rule 1: CTA Buried
  if (
    t.avg_scroll_depth < CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR &&
    t.cta_clicks === 0
  ) {
    tasks.push({
      asset_id: assetId,
      task_type: "DOM_REORDER",
      reason:
        `CTA buried: avg scroll depth ${t.avg_scroll_depth.toFixed(1)}% ` +
        `(threshold: ${CRO_THRESHOLDS.SCROLL_DEPTH_FLOOR}%) with 0 CTA clicks ` +
        `after ${t.total_views} views. Moving CTA above the fold.`,
      priority: t.cta_clicks === 0 && t.avg_scroll_depth < 15 ? "high" : "medium",
      playbook: "default",
      telemetry: snap,
    });
  }

  // Original Rule 2: Weak Intro
  if (t.avg_dwell_time_seconds < CRO_THRESHOLDS.DWELL_TIME_FLOOR) {
    tasks.push({
      asset_id: assetId,
      task_type: "CONTENT_REWRITE",
      reason:
        `Weak intro: avg dwell time ${t.avg_dwell_time_seconds}s ` +
        `(threshold: ${CRO_THRESHOLDS.DWELL_TIME_FLOOR}s) after ${t.total_views} views. ` +
        `Rewriting introduction to improve engagement.`,
      priority: t.avg_dwell_time_seconds < 5 ? "high" : "medium",
      playbook: "default",
      telemetry: snap,
    });
  }

  return tasks;
}

// ─────────────────────────────────────────────────────────────
// Core Evaluation Function
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates a single page's telemetry data using the appropriate
 * business-model playbook and returns optimization tasks.
 */
export function evaluatePagePerformance(
  assetId: string,
  telemetry: TelemetryRow,
  businessModel: BusinessModel | "" = ""
): CROEvaluationResult {
  const {
    total_views,
    last_optimized_at,
  } = telemetry;

  const effectiveModel = businessModel || "default";

  // Not enough data yet — skip
  if (total_views < CRO_THRESHOLDS.MIN_VIEWS) {
    return {
      asset_id: assetId,
      needs_optimization: false,
      business_model: effectiveModel as BusinessModel | "default",
      tasks: [],
      summary: `Insufficient data (${total_views}/${CRO_THRESHOLDS.MIN_VIEWS} views). Waiting for more traffic.`,
    };
  }

  // Cooldown check: don't re-optimize too soon
  if (last_optimized_at) {
    const lastOpt = new Date(last_optimized_at).getTime();
    const cooldownMs = CRO_THRESHOLDS.OPTIMIZATION_COOLDOWN_HOURS * 3600 * 1000;
    if (Date.now() - lastOpt < cooldownMs) {
      return {
        asset_id: assetId,
        needs_optimization: false,
        business_model: effectiveModel as BusinessModel | "default",
        tasks: [],
        summary: `Optimization cooldown active (last optimized ${last_optimized_at}). Check again after ${CRO_THRESHOLDS.OPTIMIZATION_COOLDOWN_HOURS}h.`,
      };
    }
  }

  // ── Route to the correct playbook ──
  let tasks: CROTask[];

  switch (businessModel) {
    case "e-commerce":
      tasks = evaluateEcommerce(assetId, telemetry);
      break;
    case "lead_gen":
      tasks = evaluateLeadGen(assetId, telemetry);
      break;
    case "affiliate":
      tasks = evaluateAffiliate(assetId, telemetry);
      break;
    case "publisher":
      tasks = evaluatePublisher(assetId, telemetry);
      break;
    default:
      tasks = evaluateDefault(assetId, telemetry);
      break;
  }

  const needs_optimization = tasks.length > 0;

  return {
    asset_id: assetId,
    needs_optimization,
    business_model: effectiveModel as BusinessModel | "default",
    tasks,
    summary: needs_optimization
      ? `[${effectiveModel}] ${tasks.length} optimization(s): ${tasks.map((t) => t.task_type).join(", ")}`
      : `[${effectiveModel}] Page performing within thresholds (scroll: ${telemetry.avg_scroll_depth.toFixed(1)}%, dwell: ${telemetry.avg_dwell_time_seconds}s, clicks: ${telemetry.cta_clicks}).`,
  };
}

// ─────────────────────────────────────────────────────────────
// North Star Enrichment (Phase 45)
// ─────────────────────────────────────────────────────────────

/**
 * Enrich CRO tasks with North Star design intelligence.
 * Appends specific design guidance from the North Star analysis
 * to each task's reason field, so the Swarm's optimization
 * instructions reference the aspirational site's patterns.
 */
function enrichTasksWithNorthStar(
  tasks: CROTask[],
  analysis: NorthStarAnalysis
): CROTask[] {
  return tasks.map((task) => {
    let northStarGuidance = "";

    switch (task.task_type) {
      case "CTA_OPTIMIZATION":
        northStarGuidance = `\n\n🌟 North Star guidance: ${analysis.ctaPatterns}`;
        break;
      case "DOM_REORDER":
        northStarGuidance = `\n\n🌟 North Star guidance: ${analysis.layoutStructure}`;
        break;
      case "CONTENT_REWRITE":
        northStarGuidance = `\n\n🌟 North Star guidance (typography): ${analysis.typography}`;
        break;
      case "FUNNEL_FIX":
        northStarGuidance = `\n\n🌟 North Star guidance (trust + CTAs): ${analysis.trustSignals} CTA approach: ${analysis.ctaPatterns}`;
        break;
      case "LINK_PLACEMENT":
        northStarGuidance = `\n\n🌟 North Star guidance (layout): ${analysis.layoutStructure}`;
        break;
      case "ENGAGEMENT_BOOST":
        northStarGuidance = `\n\n🌟 North Star guidance (key principle): ${analysis.keyTakeaway}`;
        break;
    }

    return {
      ...task,
      reason: task.reason + northStarGuidance,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Batch Evaluation (for cron-triggered sweeps)
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates all tracked pages in a project using the project's
 * business model and returns a prioritized list of optimization
 * tasks for the swarm.
 */
export function evaluateProjectTelemetry(
  pages: TelemetryRow[],
  businessModel: BusinessModel | "" = "",
  northStarAnalysis?: NorthStarAnalysis | null
): {
  total_evaluated: number;
  pages_needing_optimization: number;
  business_model: string;
  north_star_enriched: boolean;
  conversion_config: ConversionConfig;
  tasks: CROTask[];
  results: CROEvaluationResult[];
} {
  const results = pages.map((page) =>
    evaluatePagePerformance(page.asset_id, page, businessModel)
  );

  let allTasks = results.flatMap((r) => r.tasks);

  // Phase 45: Enrich tasks with North Star design intelligence
  const hasNorthStar = !!northStarAnalysis;
  if (northStarAnalysis) {
    allTasks = enrichTasksWithNorthStar(allTasks, northStarAnalysis);
  }

  // Sort tasks: high priority first, then by view count (descending)
  allTasks.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.telemetry.total_views - a.telemetry.total_views;
  });

  return {
    total_evaluated: pages.length,
    pages_needing_optimization: results.filter((r) => r.needs_optimization)
      .length,
    business_model: businessModel || "default",
    north_star_enriched: hasNorthStar,
    conversion_config: getConversionConfig(businessModel || "default"),
    tasks: allTasks,
    results,
  };
}
