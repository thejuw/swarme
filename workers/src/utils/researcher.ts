/**
 * ============================================================
 * Swarme — Phase 27: Proactive Market Intelligence (Researcher)
 * ============================================================
 *
 * Uses the Perplexity API to scan the competitive landscape and
 * surface threats / opportunities. Called by the retention cron
 * to proactively alert operators of market shifts that could
 * cause churn (e.g., a competitor launches a free tier).
 *
 * Falls back to mock data when PERPLEXITY_API_KEY is not set.
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface CompetitorInsight {
  name: string;
  signal: string;       // What was detected
  severity: "low" | "medium" | "high";
  recommendation: string;
}

export interface MarketScanResult {
  scanId: string;
  projectId: string;
  competitors: CompetitorInsight[];
  threats: string[];
  opportunities: string[];
  scannedAt: string;
  source: "perplexity" | "mock_fallback";
}

// ─────────────────────────────────────────────────────────────
// Perplexity API Integration
// ─────────────────────────────────────────────────────────────

const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";

/**
 * Run a proactive market scan for a given project.
 *
 * 1. Fetches the project's competitor list from Brand_Context
 * 2. Queries Perplexity for recent competitive intelligence
 * 3. Parses the response into structured insights
 * 4. Stores results in Competitor_Scans table
 */
export async function runProactiveMarketScan(
  projectId: string,
  env: Env
): Promise<MarketScanResult> {
  const scanId = crypto.randomUUID().replace(/-/g, "").substring(0, 32);
  const now = new Date().toISOString();

  // Fetch competitor list from Brand_Context (Phase 26)
  let competitors = "Ahrefs, Semrush, Surfer SEO, Clearscope";
  try {
    const ctx = await env.DB.prepare(
      "SELECT competitors FROM Brand_Context WHERE project_id = ?1"
    ).bind(projectId).first<{ competitors: string }>();
    if (ctx?.competitors) {
      competitors = ctx.competitors;
    }
  } catch (_) {
    console.warn("[Researcher] Could not fetch Brand_Context — using defaults");
  }

  const apiKey = env.PERPLEXITY_API_KEY;

  // If no API key, return mock data
  if (!apiKey) {
    console.log("[Researcher] PERPLEXITY_API_KEY not set — returning mock scan");
    return buildMockScan(scanId, projectId, competitors, now, env);
  }

  // Build the intelligence prompt
  const systemPrompt = `You are a competitive intelligence analyst for an AI-powered SEO platform. Analyze the competitive landscape and return a JSON object with these fields:
  - competitors: array of objects { name, signal, severity (low/medium/high), recommendation }
  - threats: array of short threat descriptions
  - opportunities: array of short opportunity descriptions
  Only return valid JSON, no markdown or explanation.`;

  const userPrompt = `Scan the latest news, product launches, pricing changes, and feature announcements for these competitors: ${competitors}.

Focus on:
1. New features that could lure customers away
2. Pricing changes (especially if they launched a free tier or lowered prices)
3. Partnership announcements or acquisitions
4. Negative signals (outages, layoffs, negative reviews)
5. Market trends that create opportunities for us

Return structured JSON only.`;

  try {
    const res = await fetch(PERPLEXITY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Researcher] Perplexity API error (${res.status}): ${errText}`);
      return buildMockScan(scanId, projectId, competitors, now, env);
    }

    const data = (await res.json()) as any;
    const rawContent = data?.choices?.[0]?.message?.content || "";

    // Parse the JSON from the response
    let parsed: any;
    try {
      // Strip markdown code fences if present
      const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Researcher] Failed to parse Perplexity response as JSON");
      return buildMockScan(scanId, projectId, competitors, now, env);
    }

    const result: MarketScanResult = {
      scanId,
      projectId,
      competitors: (parsed.competitors || []).map((c: any) => ({
        name: c.name || "Unknown",
        signal: c.signal || "",
        severity: c.severity || "low",
        recommendation: c.recommendation || "",
      })),
      threats: parsed.threats || [],
      opportunities: parsed.opportunities || [],
      scannedAt: now,
      source: "perplexity",
    };

    // Store in D1
    await storeScanResult(result, rawContent, env);

    return result;
  } catch (err) {
    console.error("[Researcher] Market scan failed:", err instanceof Error ? err.message : err);
    return buildMockScan(scanId, projectId, competitors, now, env);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function storeScanResult(
  result: MarketScanResult,
  rawResponse: string,
  env: Env
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO Competitor_Scans (id, project_id, scan_type, competitors, threats, opportunities, raw_response)
       VALUES (?1, ?2, 'market_intelligence', ?3, ?4, ?5, ?6)`
    ).bind(
      result.scanId,
      result.projectId,
      JSON.stringify(result.competitors),
      JSON.stringify(result.threats),
      JSON.stringify(result.opportunities),
      rawResponse
    ).run();
  } catch (err) {
    console.error("[Researcher] Failed to store scan result:", err instanceof Error ? err.message : err);
  }
}

async function buildMockScan(
  scanId: string,
  projectId: string,
  competitors: string,
  now: string,
  env: Env
): Promise<MarketScanResult> {
  const names = competitors.split(",").map((s) => s.trim()).filter(Boolean);

  const mockCompetitors: CompetitorInsight[] = [
    {
      name: names[0] || "Competitor A",
      signal: "Launched AI-powered content generation module targeting the same keyword clusters",
      severity: "high",
      recommendation: "Accelerate content pipeline velocity and highlight our edge-native advantage in positioning",
    },
    {
      name: names[1] || "Competitor B",
      signal: "Reduced Pro tier pricing by 30% with annual billing",
      severity: "medium",
      recommendation: "Consider targeted retention offers for users approaching renewal — emphasize our unique autonomous SEO capabilities",
    },
    {
      name: names[2] || "Competitor C",
      signal: "Published case study showing 40% traffic increase for e-commerce brands",
      severity: "low",
      recommendation: "Develop competing case studies with our clients showing ROI metrics from the swarm approach",
    },
  ];

  const result: MarketScanResult = {
    scanId,
    projectId,
    competitors: mockCompetitors,
    threats: [
      `${names[0] || "Competitor A"} AI content module could reduce differentiation gap`,
      `${names[1] || "Competitor B"} aggressive pricing may appeal to price-sensitive segments`,
    ],
    opportunities: [
      "Growing demand for autonomous SEO — position as the only fully autonomous solution",
      "Competitors still lack AI visibility monitoring — our unique moat",
      "E-commerce vertical highly underserved — double down on Shopify integration messaging",
    ],
    scannedAt: now,
    source: "mock_fallback",
  };

  await storeScanResult(result, JSON.stringify({ mock: true }), env);

  return result;
}
