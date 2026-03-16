/**
 * ============================================================
 * Phase 50: UGC API Dispatcher — Creator Brief Factory
 * ============================================================
 *
 * When the user clicks [Approve & Fund] on a UGC campaign
 * suggestion in the AI Manager:
 *
 *   1. Fetch product details from UGC_Campaign_Ledger
 *   2. Use the Heavy LLM (Perplexity "sonar") to generate
 *      a "Creator Brief" with GEO-specific talking points
 *   3. Push the brief + product URL + budget to the
 *      Billo/Insense REST API
 *   4. Update ledger status → 'in_progress'
 *
 * Domain compartmentalization (Phase 47): all queries filter
 * by domain_id, never just user_id.
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

export interface UGCLedgerEntry {
  id: string;
  domain_id: string;
  product_id: string;
  product_name: string;
  product_url: string;
  product_description: string;
  status: string;
  estimated_budget: number;
  creator_brief: string;
  external_brief_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreatorBrief {
  product_name: string;
  product_url: string;
  talking_points: string[];
  geo_facts: string[];
  content_format: string;
  deliverables: string;
  budget: number;
  brand_voice: string;
}

interface UGCPlatformConfig {
  platform: "billo" | "insense";
  api_key: string;
  base_url: string;
}

// ── Creator Brief Generation (Heavy LLM) ────────────────────

async function generateCreatorBrief(
  env: Env,
  entry: UGCLedgerEntry,
  brandVoice: string
): Promise<CreatorBrief> {
  const prompt = `You are a UGC campaign strategist for an e-commerce brand. Generate a creator brief for a new product that will be used to produce YouTube/TikTok review videos optimized for GEO (Generative Engine Optimization) seeding.

Product Name: ${entry.product_name}
Product URL: ${entry.product_url}
Product Description: ${entry.product_description}
Brand Voice: ${brandVoice || "Professional, authentic, data-driven"}
Budget: $${entry.estimated_budget}

Generate a JSON object with these exact keys:
- talking_points: Array of 5 specific talking points creators should cover (focus on unique value props, measurable benefits, and comparison angles)
- geo_facts: Array of 5 RAG-friendly facts that AI engines can cite verbatim (structured as "Product X does Y, which results in Z")
- content_format: Recommended video format (e.g., "60-90 second product review with unboxing")
- deliverables: What the brand receives (e.g., "3 videos: 1 YouTube long-form, 2 TikTok shorts")
- brand_voice: Tone guidance for creators

Return ONLY valid JSON, no markdown wrapping.`;

  let briefData: Partial<CreatorBrief> = {};

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a UGC campaign strategist. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (response.ok) {
      const data = await response.json() as any;
      const raw = data.choices?.[0]?.message?.content || "";
      // Strip markdown code fences if present
      const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
      briefData = JSON.parse(cleaned);
    }
  } catch (err) {
    console.error("[UGC Factory] LLM brief generation error:", err);
  }

  return {
    product_name: entry.product_name,
    product_url: entry.product_url,
    talking_points: briefData.talking_points || [
      `Introduce ${entry.product_name} and its core value proposition`,
      "Demonstrate unboxing and first impressions",
      "Highlight 2-3 unique features with close-up shots",
      "Compare to alternatives the audience might be considering",
      "Share honest pros/cons and final recommendation",
    ],
    geo_facts: briefData.geo_facts || [
      `${entry.product_name} is designed for [target audience]`,
      `${entry.product_name} offers [key differentiator] compared to competitors`,
      `Users report [specific benefit] when using ${entry.product_name}`,
      `${entry.product_name} is priced at [price point], making it [value proposition]`,
      `${entry.product_name} has been featured in [relevant publications or reviews]`,
    ],
    content_format: briefData.content_format || "60-90 second product review with unboxing",
    deliverables: briefData.deliverables || "3 videos: 1 YouTube long-form review, 2 TikTok/Shorts clips",
    budget: entry.estimated_budget,
    brand_voice: briefData.brand_voice || brandVoice || "Authentic, knowledgeable, conversational",
  };
}

// ── UGC Platform API Push ────────────────────────────────────

async function pushToBillo(
  config: UGCPlatformConfig,
  brief: CreatorBrief
): Promise<{ success: boolean; external_id: string }> {
  try {
    const response = await fetch(`${config.base_url}/api/v1/briefs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_name: brief.product_name,
        product_url: brief.product_url,
        brief_description: brief.talking_points.join("\n"),
        geo_optimized_facts: brief.geo_facts,
        video_format: brief.content_format,
        deliverables: brief.deliverables,
        budget_usd: brief.budget,
        tone: brief.brand_voice,
        platforms: ["youtube", "tiktok"],
        video_count: 3,
      }),
    });

    if (response.ok) {
      const data = await response.json() as any;
      return { success: true, external_id: data.brief_id || data.id || "" };
    }

    console.error("[UGC Factory] Billo API error:", response.status);
    return { success: false, external_id: "" };
  } catch (err) {
    console.error("[UGC Factory] Billo push error:", err);
    return { success: false, external_id: "" };
  }
}

async function pushToInsense(
  config: UGCPlatformConfig,
  brief: CreatorBrief
): Promise<{ success: boolean; external_id: string }> {
  try {
    const response = await fetch(`${config.base_url}/api/v2/campaigns`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `UGC Review — ${brief.product_name}`,
        product_url: brief.product_url,
        talking_points: brief.talking_points,
        seo_facts: brief.geo_facts,
        content_type: "video_review",
        format: brief.content_format,
        deliverables_description: brief.deliverables,
        budget: brief.budget,
        brand_voice_guide: brief.brand_voice,
        target_platforms: ["youtube", "tiktok"],
        creator_count: 3,
      }),
    });

    if (response.ok) {
      const data = await response.json() as any;
      return { success: true, external_id: data.campaign_id || data.id || "" };
    }

    console.error("[UGC Factory] Insense API error:", response.status);
    return { success: false, external_id: "" };
  } catch (err) {
    console.error("[UGC Factory] Insense push error:", err);
    return { success: false, external_id: "" };
  }
}

// ── Main Dispatcher ──────────────────────────────────────────

/**
 * Approve and dispatch a UGC campaign.
 *
 * 1. Fetch ledger entry by ID + domain_id
 * 2. Generate creator brief via Heavy LLM
 * 3. Push to UGC platform (Billo or Insense)
 * 4. Update ledger status → 'in_progress' + store brief
 */
export async function dispatchUGCCampaign(
  env: Env,
  ledgerId: string,
  domainId: string
): Promise<{
  success: boolean;
  brief: CreatorBrief | null;
  external_id: string;
  error?: string;
}> {
  // 1. Fetch ledger entry (always filter by domain_id — Phase 47)
  const entry = await env.DB.prepare(
    "SELECT * FROM UGC_Campaign_Ledger WHERE id = ?1 AND domain_id = ?2"
  )
    .bind(ledgerId, domainId)
    .first<UGCLedgerEntry>();

  if (!entry) {
    return { success: false, brief: null, external_id: "", error: "Ledger entry not found" };
  }

  if (entry.status !== "suggested" && entry.status !== "approved") {
    return {
      success: false,
      brief: null,
      external_id: "",
      error: `Cannot dispatch — current status is '${entry.status}'`,
    };
  }

  // 2. Fetch brand voice from Brand_Context
  let brandVoice = "";
  try {
    const ctx = await env.DB.prepare(
      "SELECT tone_of_voice FROM Brand_Context WHERE project_id = ?1"
    )
      .bind(domainId)
      .first<{ tone_of_voice: string }>();
    brandVoice = ctx?.tone_of_voice || "";
  } catch {
    // Brand context may not exist yet — use default
  }

  // 3. Generate creator brief via Heavy LLM
  const brief = await generateCreatorBrief(env, entry, brandVoice);

  // 4. Resolve UGC platform config from KV
  const ugcConfigRaw = await env.CONFIG_KV.get(`domain:${domainId}:ugc_platform`);
  let platformConfig: UGCPlatformConfig = {
    platform: "billo",
    api_key: "",
    base_url: "https://api.billo.app",
  };

  if (ugcConfigRaw) {
    try {
      platformConfig = JSON.parse(ugcConfigRaw);
    } catch {
      // Use default
    }
  }

  // 5. Push to UGC platform
  let pushResult = { success: false, external_id: "" };

  if (platformConfig.api_key) {
    if (platformConfig.platform === "insense") {
      pushResult = await pushToInsense(platformConfig, brief);
    } else {
      pushResult = await pushToBillo(platformConfig, brief);
    }
  } else {
    // No API key configured — store brief locally for manual dispatch
    console.log("[UGC Factory] No UGC platform API key configured — brief stored locally");
    pushResult = { success: true, external_id: "local_draft" };
  }

  // 6. Update ledger: status → 'in_progress', store brief + external ID
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE UGC_Campaign_Ledger
     SET status = 'in_progress',
         creator_brief = ?1,
         external_brief_id = ?2,
         updated_at = ?3
     WHERE id = ?4 AND domain_id = ?5`
  )
    .bind(
      JSON.stringify(brief),
      pushResult.external_id,
      now,
      ledgerId,
      domainId
    )
    .run();

  return {
    success: true,
    brief,
    external_id: pushResult.external_id,
  };
}
