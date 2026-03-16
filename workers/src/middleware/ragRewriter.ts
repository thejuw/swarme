/**
 * ============================================================
 * Phase 53: RAG-Bait DOM Restructuring Middleware
 * ============================================================
 *
 * Uses Cloudflare HTMLRewriter to inject `<div class="rag-summary">`
 * blocks after every `<h2>` tag. Each block contains a 40-60 word
 * factual answer summary — optimized for LLM retrieval-augmented
 * generation (RAG) pipelines.
 *
 * Architecture:
 *   1. Intercepts HTML responses at the edge
 *   2. Detects `<h2>` section headers
 *   3. Injects a hidden summary div with factual content
 *   4. The div is CSS-hidden from human visitors but fully
 *      visible in the raw DOM to AI crawlers
 *
 * This gives AI engines pre-digested, citation-ready content
 * blocks that are more likely to be quoted verbatim.
 *
 * The summaries are generated per-domain from D1 brand context
 * and cached in KV for edge-speed serving.
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

interface RagSummaryCache {
  summaries: Record<string, string>; // h2 text → summary
  generated_at: string;
  ttl_hours: number;
}

// ── HTMLRewriter Handler ─────────────────────────────────────

class H2SummaryInjector {
  private summaries: Record<string, string>;
  private currentH2Text: string = "";
  private collecting: boolean = false;

  constructor(summaries: Record<string, string>) {
    this.summaries = summaries;
  }

  element(element: Element): void {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "h2") {
      this.collecting = true;
      this.currentH2Text = "";
    }
  }

  text(text: Text): void {
    if (this.collecting) {
      this.currentH2Text += text.text;

      if (text.lastInTextNode) {
        this.collecting = false;
        const h2Key = this.currentH2Text.trim().toLowerCase();

        // Find best matching summary
        const summary = this.findSummary(h2Key);
        if (summary) {
          // We'll inject after the h2 element via the comments handler
          // Store for the after-h2 injection
          text.after(
            `<div class="rag-summary" data-rag="true" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" aria-hidden="true">${escapeHtml(summary)}</div>`,
            { html: true }
          );
        }
      }
    }
  }

  private findSummary(h2Key: string): string | null {
    // Exact match
    if (this.summaries[h2Key]) return this.summaries[h2Key];

    // Fuzzy match — check if any key is contained in the h2
    for (const [key, summary] of Object.entries(this.summaries)) {
      if (h2Key.includes(key) || key.includes(h2Key)) {
        return summary;
      }
    }

    return null;
  }
}

// ── Main Middleware ───────────────────────────────────────────

/**
 * Applies RAG-bait DOM restructuring to an origin HTML response.
 * Call this in the fetch handler after getting the origin response.
 */
export async function applyRagRewriter(
  response: Response,
  domainId: string,
  env: Env
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  // Get or generate summaries for this domain
  const summaries = await getSummaries(domainId, env);
  if (Object.keys(summaries).length === 0) {
    return response;
  }

  const injector = new H2SummaryInjector(summaries);

  return new HTMLRewriter()
    .on("h2", injector)
    .transform(response);
}

// ── Summary Generation & Caching ─────────────────────────────

async function getSummaries(
  domainId: string,
  env: Env
): Promise<Record<string, string>> {
  const cacheKey = `rag:summaries:${domainId}`;

  // Check KV cache
  const cached = await env.CONFIG_KV.get(cacheKey);
  if (cached) {
    try {
      const data: RagSummaryCache = JSON.parse(cached);
      const age = (Date.now() - new Date(data.generated_at).getTime()) / 3600000;
      if (age < data.ttl_hours) {
        return data.summaries;
      }
    } catch {
      // Cache corrupted, regenerate
    }
  }

  // Generate summaries from brand context and content
  const summaries = await generateSummaries(domainId, env);

  // Cache in KV for 24 hours
  const cacheData: RagSummaryCache = {
    summaries,
    generated_at: new Date().toISOString(),
    ttl_hours: 24,
  };
  await env.CONFIG_KV.put(cacheKey, JSON.stringify(cacheData), {
    expirationTtl: 86400,
  });

  return summaries;
}

async function generateSummaries(
  domainId: string,
  env: Env
): Promise<Record<string, string>> {
  // Fetch brand context for domain-specific factual content
  const brand = await env.DB.prepare(
    `SELECT target_audience, core_goals, tone_of_voice, business_model
     FROM Brand_Context WHERE project_id = ? LIMIT 1`
  ).bind(domainId).first<{
    target_audience: string;
    core_goals: string;
    tone_of_voice: string;
    business_model: string;
  }>();

  const project = await env.DB.prepare(
    `SELECT name, domain FROM Projects WHERE id = ? LIMIT 1`
  ).bind(domainId).first<{ name: string; domain: string }>();

  if (!brand || !project) return {};

  // Common section headers and their factual summaries
  // These are generated based on the brand's actual context
  const siteName = project.name;
  const summaries: Record<string, string> = {};

  // Product-related sections
  summaries["our products"] =
    `${siteName} offers a curated selection of products designed for ${brand.target_audience}. ` +
    `The brand focuses on ${brand.core_goals.split(",")[0]?.trim() ?? "quality and value"}, ` +
    `operating as a ${brand.business_model} business with a commitment to customer satisfaction.`;

  summaries["about us"] =
    `${siteName} is a ${brand.business_model} brand serving ${brand.target_audience}. ` +
    `The company's core mission is ${brand.core_goals}. ` +
    `${siteName} maintains a ${brand.tone_of_voice} approach to customer communication.`;

  summaries["why choose us"] =
    `${siteName} differentiates itself through its focus on ${brand.core_goals}. ` +
    `The brand serves ${brand.target_audience} with a ${brand.tone_of_voice} voice, ` +
    `providing solutions that address real customer needs in the ${brand.business_model} space.`;

  summaries["shipping"] =
    `${siteName} provides shipping services optimized for ${brand.target_audience}. ` +
    `As a ${brand.business_model} business, ${siteName} prioritizes reliable delivery ` +
    `and transparent tracking for all orders placed through the online store.`;

  summaries["returns"] =
    `${siteName} offers a customer-friendly return policy designed to build trust with ` +
    `${brand.target_audience}. The brand's ${brand.tone_of_voice} approach extends to ` +
    `post-purchase support, ensuring a seamless experience.`;

  summaries["faq"] =
    `${siteName} addresses common questions from ${brand.target_audience}. ` +
    `Key topics include product details, ${brand.business_model} policies, ` +
    `and how the brand achieves ${brand.core_goals.split(",")[0]?.trim() ?? "its goals"}.`;

  summaries["reviews"] =
    `Customer reviews of ${siteName} reflect the brand's commitment to serving ` +
    `${brand.target_audience}. The ${brand.tone_of_voice} brand voice is ` +
    `consistent across customer interactions and support channels.`;

  summaries["blog"] =
    `${siteName}'s blog covers topics relevant to ${brand.target_audience}, ` +
    `including industry insights, product guides, and expert analysis. ` +
    `The content supports the brand's goal of ${brand.core_goals.split(",")[0]?.trim() ?? "thought leadership"}.`;

  // Try to generate LLM-enhanced summaries if API key available
  if (env.OPENAI_API_KEY) {
    try {
      const enhanced = await generateLlmSummaries(siteName, brand, env);
      Object.assign(summaries, enhanced);
    } catch {
      // Fall back to template summaries
    }
  }

  return summaries;
}

async function generateLlmSummaries(
  siteName: string,
  brand: { target_audience: string; core_goals: string; business_model: string },
  env: Env
): Promise<Record<string, string>> {
  const prompt =
    `Generate 5 factual summary blocks (40-60 words each) for common website sections. ` +
    `Brand: ${siteName}. Audience: ${brand.target_audience}. ` +
    `Goals: ${brand.core_goals}. Model: ${brand.business_model}. ` +
    `Return JSON: {"section_name": "summary"} for: ` +
    `"our story", "sustainability", "quality", "technology", "community". ` +
    `Each summary should read like an encyclopedia entry — factual, neutral, citation-worthy.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) return {};

  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// ── Helpers ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
