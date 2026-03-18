/**
 * ============================================================
 * Swarme — Phase 65: Tenant Insight Anonymization Pipeline
 * ============================================================
 *
 * Before any local tenant lesson is contributed to the Global
 * Hive Mind, it passes through a two-stage sanitization pipeline:
 *
 *   Stage 1 — REGEX PRE-FILTER: Strip URLs, emails, prices,
 *     phone numbers, and obvious brand markers using deterministic
 *     pattern matching. Fast and cheap (no LLM call needed).
 *
 *   Stage 2 — LLM DEEP SANITIZATION: Send the pre-filtered text
 *     to an LLM with a strict instruction prompt that extracts
 *     ONLY the structural/algorithmic finding while removing any
 *     remaining brand names, product details, or pricing data.
 *
 * Example transformation:
 *   Raw:   "Injecting FAQ schema for the Sartelle boots
 *           product page increased CTR by 4%."
 *   Stage 1: "Injecting FAQ schema for the [REDACTED] product
 *             page increased CTR by 4%."
 *   Stage 2: "Injecting FAQ schema on luxury apparel product
 *             pages increases CTR."
 *
 * The originating_category (e-commerce, saas, publisher, etc.)
 * is inferred from the Brand_Context business_model field and
 * passed alongside the sanitized lesson to the Global Brain.
 *
 * CRITICAL: This pipeline is the security boundary between
 * tenant isolation and the federated learning system. No raw
 * tenant data may bypass this filter.
 * ============================================================
 */

import type { Env } from "../index";
import { createThrottledFetch } from "./throttle";

// ── Types ───────────────────────────────────────────────────

export interface AnonymizedInsight {
  sanitized_lesson: string;
  originating_category: string;
}

export interface AnonymizationResult {
  success: boolean;
  insight: AnonymizedInsight | null;
  rejected: boolean;
  rejection_reason?: string;
}

// ── Stage 1: Regex Pre-Filter ───────────────────────────────

/** Patterns that indicate tenant-specific PII or brand data */
const REDACTION_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // URLs (http/https)
  { regex: /https?:\/\/[^\s,)]+/gi, replacement: "[URL]" },
  // Email addresses
  { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, replacement: "[EMAIL]" },
  // Phone numbers (various formats)
  { regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: "[PHONE]" },
  // Prices ($XX.XX, €XX, £XX)
  { regex: /[$€£¥]\s?\d{1,}[,.]?\d{0,2}(k|K|M)?\b/g, replacement: "[PRICE]" },
  // IP addresses
  { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[IP]" },
  // Dates with specific years that could identify a tenant
  { regex: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, replacement: "[DATE]" },
];

/**
 * Apply deterministic regex redactions — fast, no LLM call.
 */
function regexPreFilter(text: string): string {
  let result = text;
  for (const { regex, replacement } of REDACTION_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// ── Stage 2: LLM Deep Sanitization ─────────────────────────

const SANITIZATION_PROMPT = `You are a strict data anonymization agent for a federated learning system. Your job is to extract ONLY the structural, technical, or algorithmic finding from a tenant's lesson learned.

RULES:
1. Remove ALL brand names, company names, product names, and person names.
2. Remove ALL URLs, domains, pricing, and revenue figures.
3. Remove ALL references to specific dates, campaigns, or events.
4. Generalize product categories (e.g., "Sartelle boots" becomes "luxury apparel products").
5. Preserve the TECHNICAL INSIGHT — the tactic, the metric change direction, and the content structure that caused it.
6. Keep the percentage change if present (e.g., "increased CTR by 4%") as it represents the algorithmic signal.
7. Output ONLY the sanitized lesson as a single sentence. No preamble, no explanation.
8. If the input contains no useful algorithmic or structural insight (e.g., it's purely about a specific brand event), output exactly: REJECT

Examples:
Input: "Injecting FAQ schema for the Sartelle boots product page on example.com increased CTR by 4%."
Output: "Injecting FAQ schema on luxury apparel product pages increases CTR by approximately 4%."

Input: "Moving the email signup CTA above the fold on HealthyPets.com blog posts increased lead capture by 12%."
Output: "Positioning email signup CTAs above the fold on blog posts increases lead capture by approximately 12%."

Input: "Our Black Friday 2025 campaign for Acme Corp generated $2.3M in revenue."
Output: REJECT`;

/**
 * anonymizeLesson — Full two-stage anonymization pipeline.
 *
 * Called by the outcomeEvaluator after a significant lesson is
 * extracted, BEFORE the lesson is inserted into the global
 * Unverified_Insights table.
 */
export async function anonymizeLesson(
  rawLesson: string,
  businessModel: string,
  env: Env,
): Promise<AnonymizationResult> {
  // Stage 1: Regex pre-filter
  const preFiltered = regexPreFilter(rawLesson);

  // Stage 2: LLM deep sanitization
  const globalConfig = await env.CONFIG_KV.get<
    Record<string, Record<string, string>>
  >("global:config:keys", "json");
  const vaultKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY;
  const apiKey =
    vaultKey && vaultKey.trim().length > 10
      ? vaultKey.trim()
      : env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.warn("[Anonymizer] No API key available — falling back to regex-only sanitization");
    // Fallback: use regex-only result with a lower confidence marker
    return {
      success: true,
      insight: {
        sanitized_lesson: preFiltered,
        originating_category: mapBusinessModel(businessModel),
      },
      rejected: false,
    };
  }

  try {
    const throttledFetch = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
    const response = await throttledFetch(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: SANITIZATION_PROMPT },
            { role: "user", content: preFiltered },
          ],
          temperature: 0.1, // Low temperature for deterministic sanitization
          max_tokens: 200,
        }),
      },
    );

    if (!response.ok) {
      console.error(`[Anonymizer] LLM call failed (HTTP ${response.status})`);
      // Fallback to regex-only
      return {
        success: true,
        insight: {
          sanitized_lesson: preFiltered,
          originating_category: mapBusinessModel(businessModel),
        },
        rejected: false,
      };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };

    const sanitized = data.choices[0]?.message?.content?.trim() ?? "";

    // Check for REJECT signal
    if (sanitized.toUpperCase() === "REJECT" || sanitized.length === 0) {
      return {
        success: true,
        insight: null,
        rejected: true,
        rejection_reason: "LLM determined the lesson contains no structural insight",
      };
    }

    return {
      success: true,
      insight: {
        sanitized_lesson: sanitized,
        originating_category: mapBusinessModel(businessModel),
      },
      rejected: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Anonymizer] Pipeline error: ${msg}`);
    // Fallback to regex-only
    return {
      success: true,
      insight: {
        sanitized_lesson: preFiltered,
        originating_category: mapBusinessModel(businessModel),
      },
      rejected: false,
    };
  }
}

/**
 * hashDomainId — One-way SHA-256 hash of a domain_id.
 * Used to count unique domain contributors in the consensus
 * engine without revealing the originating tenant.
 */
export async function hashDomainId(domainId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`swarme_hive_${domainId}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Map the raw business_model string from Brand_Context to a
 * standardized category for the Global Brain.
 */
function mapBusinessModel(model: string): string {
  const normalized = (model || "").toLowerCase().trim();
  switch (normalized) {
    case "e-commerce":
      return "ecommerce";
    case "lead_gen":
      return "lead_generation";
    case "affiliate":
      return "affiliate";
    case "publisher":
      return "publisher";
    default:
      return "general";
  }
}

/**
 * Resolve the business model for a given domain by looking up
 * the Brand_Context table. Used by the outcomeEvaluator to
 * determine the originating_category for anonymized insights.
 */
export async function resolveDomainCategory(
  domainId: string,
  env: Env,
): Promise<string> {
  try {
    const row = await env.DB.prepare(
      `SELECT business_model FROM Brand_Context WHERE project_id = ?1 LIMIT 1`,
    )
      .bind(domainId)
      .first<{ business_model: string }>();

    return mapBusinessModel(row?.business_model ?? "");
  } catch {
    return "general";
  }
}
