/**
 * ============================================================
 * Swarme — Phase 16 + Phase 43: CRO Evaluation Engine
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
 * The CRO engine does NOT mutate data — it evaluates and returns
 * a list of optimization tasks for the Durable Object to execute.
 *
 * The A/B testing statistical engine (Phase 35) uses these
 * business-model-specific conversion events as the "Winner"
 * metric via getConversionConfig().
 * ============================================================
 */

import type { BusinessModel } from "./aiManager";

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
// Batch Evaluation (for cron-triggered sweeps)
// ─────────────────────────────────────────────────────────────

/**
 * Evaluates all tracked pages in a project using the project's
 * business model and returns a prioritized list of optimization
 * tasks for the swarm.
 */
export function evaluateProjectTelemetry(
  pages: TelemetryRow[],
  businessModel: BusinessModel | "" = ""
): {
  total_evaluated: number;
  pages_needing_optimization: number;
  business_model: string;
  conversion_config: ConversionConfig;
  tasks: CROTask[];
  results: CROEvaluationResult[];
} {
  const results = pages.map((page) =>
    evaluatePagePerformance(page.asset_id, page, businessModel)
  );

  const allTasks = results.flatMap((r) => r.tasks);

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
    conversion_config: getConversionConfig(businessModel || "default"),
    tasks: allTasks,
    results,
  };
}
