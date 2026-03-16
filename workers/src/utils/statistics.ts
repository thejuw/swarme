/**
 * ============================================================
 * Phase 35: Statistical Significance Engine
 * ============================================================
 *
 * Implements a two-proportion Z-test to determine whether the
 * conversion-rate difference between variants A and B is
 * statistically significant.
 *
 * The Z-test compares two independent proportions:
 *   p_A = conversions_A / views_A
 *   p_B = conversions_B / views_B
 *
 * Under the null hypothesis (no difference), both samples are
 * drawn from a common proportion:
 *   p_pool = (conversions_A + conversions_B) / (views_A + views_B)
 *
 * The standard error is:
 *   SE = sqrt( p_pool * (1 - p_pool) * (1/views_A + 1/views_B) )
 *
 * The test statistic:
 *   Z = (p_A - p_B) / SE
 *
 * The two-tailed p-value is:
 *   p = 2 * (1 - Φ(|Z|))
 *
 * where Φ is the standard normal CDF, approximated using the
 * Abramowitz & Stegun rational approximation (error < 7.5e-8).
 *
 * References:
 *   - Abramowitz & Stegun, Handbook of Mathematical Functions, §26.2.17
 *   - Rice, J.A. "Mathematical Statistics and Data Analysis", 3rd ed.
 * ============================================================
 */

import type { Env } from "../index";
import { getConversionConfig, type ConversionConfig } from "./cro";
import type { BusinessModel } from "./aiManager";

export interface SignificanceResult {
  /** Conversion rate for variant A (0–1) */
  rateA: number;
  /** Conversion rate for variant B (0–1) */
  rateB: number;
  /** The pooled proportion under H₀ */
  pooledRate: number;
  /** Z test statistic */
  zScore: number;
  /** Two-tailed p-value */
  pValue: number;
  /** Confidence level as percentage (e.g. 95.2) */
  confidence: number;
  /** Whether the test has reached statistical significance (p < 0.05) */
  isSignificant: boolean;
  /** The winning variant, or null if not yet significant */
  winner: "A" | "B" | null;
  /** Whether the minimum view threshold has been met */
  meetsMinViews: boolean;
  /** The conversion config used to determine the winner metric (Phase 43) */
  conversionConfig?: ConversionConfig;
}

/**
 * Standard normal CDF approximation.
 * Uses the Abramowitz & Stegun rational approximation (§26.2.17).
 * Maximum error: 7.5 × 10⁻⁸
 */
function normalCDF(x: number): number {
  // Constants from Abramowitz & Stegun
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  // A&S formula 26.2.17
  const t = 1.0 / (1.0 + p * absX);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1.0 - poly * Math.exp(-absX * absX / 2.0);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate statistical significance for an A/B test.
 *
 * @param viewsA        - Total unique views for variant A
 * @param conversionsA  - Total conversions for variant A
 * @param viewsB        - Total unique views for variant B
 * @param conversionsB  - Total conversions for variant B
 * @param minViews      - Minimum total views before significance can be declared
 *
 * @returns A SignificanceResult object with all computed metrics
 */
export function calculateSignificance(
  viewsA: number,
  conversionsA: number,
  viewsB: number,
  conversionsB: number,
  minViews: number = 500
): SignificanceResult {
  const totalViews = viewsA + viewsB;
  const meetsMinViews = totalViews >= minViews;

  // Edge case: not enough data to compute
  if (viewsA === 0 || viewsB === 0) {
    return {
      rateA: 0,
      rateB: 0,
      pooledRate: 0,
      zScore: 0,
      pValue: 1,
      confidence: 0,
      isSignificant: false,
      winner: null,
      meetsMinViews: false,
    };
  }

  // Conversion rates
  const rateA = conversionsA / viewsA;
  const rateB = conversionsB / viewsB;

  // Pooled proportion under H₀
  const pooledRate = (conversionsA + conversionsB) / totalViews;

  // Edge case: pooled rate is 0 or 1 (no variance)
  if (pooledRate === 0 || pooledRate === 1) {
    return {
      rateA,
      rateB,
      pooledRate,
      zScore: 0,
      pValue: 1,
      confidence: 0,
      isSignificant: false,
      winner: null,
      meetsMinViews,
    };
  }

  // Standard error of the difference
  const se = Math.sqrt(
    pooledRate * (1 - pooledRate) * (1 / viewsA + 1 / viewsB)
  );

  // Z test statistic
  const zScore = (rateA - rateB) / se;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

  // Confidence level
  const confidence = Math.min(100, Math.max(0, (1 - pValue) * 100));

  // Significance check
  const isSignificant = pValue < 0.05 && meetsMinViews;

  // Determine winner (only if significant)
  let winner: "A" | "B" | null = null;
  if (isSignificant) {
    winner = rateA > rateB ? "A" : "B";
  }

  return {
    rateA: Math.round(rateA * 10000) / 10000,
    rateB: Math.round(rateB * 10000) / 10000,
    pooledRate: Math.round(pooledRate * 10000) / 10000,
    zScore: Math.round(zScore * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    confidence: Math.round(confidence * 10) / 10,
    isSignificant,
    winner,
    meetsMinViews,
  };
}

/**
 * Evaluate an A/B test and auto-conclude if significance is reached.
 *
 * When a test reaches 95% confidence with the minimum view threshold met:
 *   1. Sets status to 'Concluded' and records the winner in D1.
 *   2. Logs a concluded task to Agent_Tasks for audit trail.
 *
 * The winning HTML can then be permanently pushed to the live CMS
 * via the Phase 13 publishing adapters by the orchestrator.
 *
 * @param env    - Cloudflare Worker env bindings
 * @param testId - The AB_Tests row ID to evaluate
 *
 * @returns The SignificanceResult, or null if the test wasn't found
 */
export async function evaluateAndConclude(
  env: Env,
  testId: string
): Promise<SignificanceResult | null> {
  // Fetch current test state
  const row = await env.DB.prepare(
    `SELECT id, project_id, asset_id, test_name,
            views_a, views_b, conversions_a, conversions_b,
            min_views, status
     FROM AB_Tests WHERE id = ?1`
  )
    .bind(testId)
    .first<{
      id: string;
      project_id: string;
      asset_id: string;
      test_name: string;
      views_a: number;
      views_b: number;
      conversions_a: number;
      conversions_b: number;
      min_views: number;
      status: string;
    }>();

  if (!row || row.status === "Concluded") return null;

  const result = calculateSignificance(
    row.views_a,
    row.conversions_a,
    row.views_b,
    row.conversions_b,
    row.min_views
  );

  // Fetch the brand's business model to determine the conversion metric
  let businessModel: BusinessModel | "" = "";
  try {
    const brandRow = await env.DB.prepare(
      `SELECT business_model FROM Brand_Context WHERE project_id = ?1`
    )
      .bind(row.project_id)
      .first<{ business_model: string }>();
    businessModel = (brandRow?.business_model as BusinessModel) || "";
  } catch {
    // Fallback to default if Brand_Context not available
  }

  const conversionConfig = getConversionConfig(businessModel || "default");
  result.conversionConfig = conversionConfig;

  // Auto-conclude if significant
  if (result.isSignificant && result.winner) {
    await env.DB.prepare(
      `UPDATE AB_Tests
       SET status = 'Concluded',
           winner = ?1,
           updated_at = datetime('now')
       WHERE id = ?2`
    )
      .bind(result.winner, testId)
      .run();

    // Log the conclusion as an agent task for audit trail
    const winnerRate = result.winner === "A" ? result.rateA : result.rateB;
    const loserRate = result.winner === "A" ? result.rateB : result.rateA;
    const lift = loserRate > 0
      ? Math.round(((winnerRate - loserRate) / loserRate) * 1000) / 10
      : 0;

    await env.DB.prepare(
      `INSERT INTO Agent_Tasks (project_id, agent_type, action, status, task_description, result_payload)
       VALUES (?1, 'cro', 'A/B Test Concluded', 'Completed', ?2, ?3)`
    )
      .bind(
        row.project_id,
        `Test "${row.test_name}" concluded: Variant ${result.winner} wins with ` +
          `${(winnerRate * 100).toFixed(1)}% ${conversionConfig.primaryKpi} vs ` +
          `${(loserRate * 100).toFixed(1)}% ${conversionConfig.primaryKpi} ` +
          `(+${lift}% lift, p=${result.pValue.toFixed(4)}, ${row.views_a + row.views_b} total views) ` +
          `[metric: ${conversionConfig.label}]`,
        JSON.stringify({
          test_id: testId,
          asset_id: row.asset_id,
          winner: result.winner,
          rateA: result.rateA,
          rateB: result.rateB,
          pValue: result.pValue,
          confidence: result.confidence,
          totalViews: row.views_a + row.views_b,
          lift,
          business_model: businessModel || "default",
          conversion_metric: conversionConfig.label,
          conversion_events: conversionConfig.events,
          primary_kpi: conversionConfig.primaryKpi,
        })
      )
      .run();

    console.log(
      `[AB Test] "${row.test_name}" concluded — Variant ${result.winner} wins ` +
        `(p=${result.pValue.toFixed(4)}, lift=${lift}%, metric=${conversionConfig.label})`
    );
  }

  return result;
}
