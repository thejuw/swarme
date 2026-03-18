/**
 * ============================================================
 * Swarme — Phase 63: Retrospective Agent + Strategy Synthesizer
 * ============================================================
 *
 * A weekly background worker (Sundays 01:00 UTC) that closes the
 * autonomous learning loop:
 *
 *   1. RETROSPECTIVE: Query Action_History for actions taken 7-14
 *      days ago — enough time for analytics impact to materialize.
 *
 *   2. ANALYTICS DELTA: For each action's affected page, pull
 *      before/after metrics from GA4_Metrics and GSC_Metrics to
 *      measure the real-world impact (sessions, bounce rate,
 *      conversions, clicks, impressions).
 *
 *   3. LLM GRADING: Pass the original action + analytics delta to
 *      Perplexity Sonar Pro. The LLM grades the outcome (-100 to
 *      +100) and, for significant results, extracts a definitive
 *      strategic rule (the "lesson learned").
 *
 *   4. STRATEGY SYNTHESIS: If the outcome is significant (score
 *      outside the -15 to +15 "noise" band), insert the lesson
 *      into Strategic_Lessons AND embed it into Vectorize so the
 *      AI Manager can semantically recall it during future chats.
 *
 * This is RAG-based reinforcement learning — the Swarm can't
 * update its own weights, but it can build a growing memory of
 * domain-specific rules that are injected into every future prompt.
 *
 * Schedule: 0 1 * * 7 (Sundays 01:00 UTC)
 *
 * ============================================================
 */

import type { Env } from "../index";
import { generateEmbedding } from "../utils/vectorize";
import { createThrottledFetch } from "../utils/throttle";
import {
  generateIdempotencyKey,
  claimIdempotencyKey,
  markKeyCompleted,
  markKeyFailed,
  currentWeekWindow,
} from "../utils/idempotency";
import { anonymizeLesson, resolveDomainCategory } from "../utils/anonymizer";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

/** Actions older than this many days ago are eligible for evaluation */
const LOOKBACK_START_DAYS = 14;

/** Actions newer than this many days ago are too recent to evaluate */
const LOOKBACK_END_DAYS = 7;

/** Maximum actions to evaluate per cron run (prevent timeout) */
const MAX_ACTIONS_PER_RUN = 30;

/**
 * Minimum absolute score to qualify as a "significant" outcome.
 * Scores in the -15 to +15 range are noise and won't generate lessons.
 */
const SIGNIFICANCE_THRESHOLD = 15;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ActionHistoryRow {
  id: string;
  project_id: string;
  domain_id: string;
  agent_type: string;
  action: string;
  entity_type: string;
  entity_id: string;
  snapshot_before: string | null;
  snapshot_after: string | null;
  created_at: string;
}

interface AnalyticsDelta {
  page_url: string | null;
  ga4: {
    sessions_before: number;
    sessions_after: number;
    bounce_before: number;
    bounce_after: number;
    conversions_before: number;
    conversions_after: number;
  } | null;
  gsc: {
    clicks_before: number;
    clicks_after: number;
    impressions_before: number;
    impressions_after: number;
    ctr_before: number;
    ctr_after: number;
    position_before: number;
    position_after: number;
  } | null;
}

interface LLMEvaluation {
  outcome_score: number;
  lesson_learned: string;
  confidence: "low" | "medium" | "high";
  reasoning: string;
}

export interface OutcomeEvaluatorResult {
  actionsEvaluated: number;
  lessonsExtracted: number;
  lessonsEmbedded: number;
  skippedInsignificant: number;
  skippedDuplicate: number;
  errors: string[];
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────

export async function handleOutcomeEvaluation(
  env: Env
): Promise<OutcomeEvaluatorResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let actionsEvaluated = 0;
  let lessonsExtracted = 0;
  let lessonsEmbedded = 0;
  let skippedInsignificant = 0;
  let skippedDuplicate = 0;

  // ── Step 1: Find evaluable actions ─────────────────────────
  const startDate = new Date(
    Date.now() - LOOKBACK_START_DAYS * 86_400_000
  ).toISOString();
  const endDate = new Date(
    Date.now() - LOOKBACK_END_DAYS * 86_400_000
  ).toISOString();

  let actions: ActionHistoryRow[] = [];

  try {
    const result = await env.DB.prepare(
      `SELECT ah.id, ah.project_id, ah.domain_id, ah.agent_type,
              ah.action, ah.entity_type, ah.entity_id,
              ah.snapshot_before, ah.snapshot_after, ah.created_at
       FROM Action_History ah
       LEFT JOIN Strategic_Lessons sl ON sl.action_reference_id = ah.id
       WHERE ah.created_at BETWEEN ?1 AND ?2
         AND ah.rolled_back = 0
         AND sl.id IS NULL
       ORDER BY ah.created_at ASC
       LIMIT ?3`
    )
      .bind(startDate, endDate, MAX_ACTIONS_PER_RUN)
      .all<ActionHistoryRow>();

    actions = result.results ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    errors.push(`Failed to query Action_History: ${msg}`);
    console.error(`[OutcomeEvaluator] Action query failed: ${msg}`);
    return {
      actionsEvaluated: 0,
      lessonsExtracted: 0,
      lessonsEmbedded: 0,
      skippedInsignificant: 0,
      skippedDuplicate: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  if (actions.length === 0) {
    console.log("[OutcomeEvaluator] No evaluable actions found in the 7-14 day window.");
    return {
      actionsEvaluated: 0,
      lessonsExtracted: 0,
      lessonsEmbedded: 0,
      skippedInsignificant: 0,
      skippedDuplicate: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  console.log(
    `[OutcomeEvaluator] Found ${actions.length} action(s) to evaluate`
  );

  // Resolve API key
  const globalConfig = await env.CONFIG_KV.get<
    Record<string, Record<string, string>>
  >("global:config:keys", "json");
  const vaultKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY;
  const apiKey =
    vaultKey && vaultKey.trim().length > 10
      ? vaultKey.trim()
      : env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    errors.push("No Perplexity API key available for LLM grading");
    return {
      actionsEvaluated: 0,
      lessonsExtracted: 0,
      lessonsEmbedded: 0,
      skippedInsignificant: 0,
      skippedDuplicate: 0,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  // ── Step 2: Evaluate each action ───────────────────────────
  for (const action of actions) {
    const domainId = action.domain_id || action.project_id;

    // Idempotency: prevent re-evaluating the same action in the same week
    const idemKey = await generateIdempotencyKey(
      domainId,
      "outcome_evaluation",
      action.id,
      currentWeekWindow()
    );

    const claim = await claimIdempotencyKey(
      env.DB,
      idemKey,
      domainId,
      "outcome_evaluation",
      10080 // 7-day TTL
    );

    if (!claim.claimed) {
      skippedDuplicate++;
      continue;
    }

    try {
      // 2a: Resolve the page URL from the action's entity
      const pageUrl = await resolvePageUrl(action, env);

      // 2b: Pull analytics delta
      const delta = await fetchAnalyticsDelta(
        domainId,
        pageUrl,
        action.created_at,
        env
      );

      // 2c: LLM grading
      const evaluation = await gradeOutcome(action, delta, apiKey, env);

      actionsEvaluated++;

      // 2d: Check significance
      if (Math.abs(evaluation.outcome_score) < SIGNIFICANCE_THRESHOLD) {
        skippedInsignificant++;
        await markKeyCompleted(
          env.DB,
          idemKey,
          JSON.stringify({ score: evaluation.outcome_score, verdict: "insignificant" })
        );
        continue;
      }

      // ── Step 3: Strategy Synthesis — insert lesson + embed ──
      const lessonId = `lesson_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

      await env.DB.prepare(
        `INSERT INTO Strategic_Lessons
           (id, domain_id, action_reference_id, action_type, action_summary,
            page_url, outcome_score, analytics_delta, lesson_learned,
            confidence, vectorize_id, evaluated_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'outcome_evaluator')`
      )
        .bind(
          lessonId,
          domainId,
          action.id,
          action.agent_type,
          action.action,
          delta.page_url ?? null,
          evaluation.outcome_score,
          JSON.stringify(delta),
          evaluation.lesson_learned,
          evaluation.confidence,
          lessonId // use lesson ID as Vectorize vector ID
        )
        .run();

      lessonsExtracted++;

      // Embed the lesson into Vectorize for semantic recall
      try {
        const embeddingText = `[${action.agent_type}] ${evaluation.lesson_learned}`;
        const embedding = await generateEmbedding(embeddingText, env);

        await env.VECTORIZE.upsert([
          {
            id: lessonId,
            values: embedding,
            metadata: {
              type: "strategic_lesson",
              domain_id: domainId,
              action_type: action.agent_type,
              outcome_score: evaluation.outcome_score,
              confidence: evaluation.confidence,
              lesson: evaluation.lesson_learned.slice(0, 500),
              created_at: new Date().toISOString(),
            },
          },
        ]);

        lessonsEmbedded++;
        console.log(
          `[OutcomeEvaluator] Embedded lesson ${lessonId}: score=${evaluation.outcome_score}, ` +
            `confidence=${evaluation.confidence}`
        );
      } catch (embedErr) {
        const msg = embedErr instanceof Error ? embedErr.message : "Unknown";
        errors.push(`Vectorize embed failed for ${lessonId}: ${msg}`);
        console.warn(`[OutcomeEvaluator] Embedding failed: ${msg}`);
        // The lesson is still saved in D1 — embedding failure is non-fatal
      }

      // ── Phase 65: Contribute anonymized insight to Global Brain ──
      try {
        const category = await resolveDomainCategory(domainId, env);
        const anonResult = await anonymizeLesson(
          evaluation.lesson_learned,
          category,
          env,
        );

        if (anonResult.success && anonResult.insight && !anonResult.rejected) {
          const insightId = `insight_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
          await env.DB.prepare(
            `INSERT INTO Unverified_Insights (id, sanitized_lesson, originating_category)
             VALUES (?1, ?2, ?3)`,
          )
            .bind(insightId, anonResult.insight.sanitized_lesson, anonResult.insight.originating_category)
            .run();

          console.log(
            `[OutcomeEvaluator] Contributed anonymized insight ${insightId} to Global Brain`,
          );
        } else if (anonResult.rejected) {
          console.log(
            `[OutcomeEvaluator] Insight rejected by anonymizer: ${anonResult.rejection_reason}`,
          );
        }
      } catch (anonErr) {
        // Non-fatal — local lesson is already saved
        console.warn(
          `[OutcomeEvaluator] Global Brain contribution failed: ${
            anonErr instanceof Error ? anonErr.message : anonErr
          }`,
        );
      }

      await markKeyCompleted(
        env.DB,
        idemKey,
        JSON.stringify({
          lesson_id: lessonId,
          score: evaluation.outcome_score,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown";
      errors.push(`Evaluation failed for action ${action.id}: ${msg}`);
      console.error(`[OutcomeEvaluator] Error evaluating ${action.id}: ${msg}`);
      await markKeyFailed(env.DB, idemKey, msg);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[OutcomeEvaluator] Complete in ${durationMs}ms — ` +
      `${actionsEvaluated} evaluated, ${lessonsExtracted} lessons, ` +
      `${lessonsEmbedded} embedded, ${skippedInsignificant} insignificant, ` +
      `${skippedDuplicate} duplicate`
  );

  return {
    actionsEvaluated,
    lessonsExtracted,
    lessonsEmbedded,
    skippedInsignificant,
    skippedDuplicate,
    errors,
    durationMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Helper: Resolve page URL from action entity
// ─────────────────────────────────────────────────────────────

/**
 * Attempts to resolve the actual page URL affected by an action.
 * Checks Content_Assets first (most common), then falls back to
 * parsing snapshot_after for a URL field.
 */
async function resolvePageUrl(
  action: ActionHistoryRow,
  env: Env
): Promise<string | null> {
  // Strategy 1: Content_Assets lookup
  if (
    action.entity_type === "content_asset" ||
    action.entity_type === "ab_test"
  ) {
    try {
      const row = await env.DB.prepare(
        `SELECT published_url, slug FROM Content_Assets WHERE id = ?1`
      )
        .bind(action.entity_id)
        .first<{ published_url: string | null; slug: string | null }>();

      if (row?.published_url) return row.published_url;
      if (row?.slug) return `/${row.slug}`;
    } catch {
      // Non-fatal — try fallback
    }
  }

  // Strategy 2: Parse snapshot_after for a URL
  if (action.snapshot_after) {
    try {
      const snap = JSON.parse(action.snapshot_after);
      if (snap.published_url) return snap.published_url;
      if (snap.page_url) return snap.page_url;
      if (snap.url) return snap.url;
      if (snap.slug) return `/${snap.slug}`;
    } catch {
      // Unparseable snapshot — skip
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Helper: Fetch analytics delta (GA4 + GSC)
// ─────────────────────────────────────────────────────────────

/**
 * Compares analytics metrics for a page URL during two windows:
 *   BEFORE: 7 days before the action was taken
 *   AFTER:  7 days after the action was taken
 *
 * Uses aggregate sums/averages from GA4_Metrics and GSC_Metrics.
 */
async function fetchAnalyticsDelta(
  domainId: string,
  pageUrl: string | null,
  actionDate: string,
  env: Env
): Promise<AnalyticsDelta> {
  const actionTime = new Date(actionDate).getTime();
  const beforeStart = new Date(actionTime - 14 * 86_400_000)
    .toISOString()
    .split("T")[0];
  const beforeEnd = new Date(actionTime - 1 * 86_400_000)
    .toISOString()
    .split("T")[0];
  const afterStart = new Date(actionTime + 1 * 86_400_000)
    .toISOString()
    .split("T")[0];
  const afterEnd = new Date(actionTime + 14 * 86_400_000)
    .toISOString()
    .split("T")[0];

  const result: AnalyticsDelta = {
    page_url: pageUrl,
    ga4: null,
    gsc: null,
  };

  if (!pageUrl) return result;

  // Extract page_path from full URL (GA4 stores paths, not full URLs)
  let pagePath: string;
  try {
    const parsed = new URL(pageUrl, "https://placeholder.com");
    pagePath = parsed.pathname;
  } catch {
    pagePath = pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`;
  }

  // ── GA4 Delta ──────────────────────────────────────────────
  try {
    const ga4Before = await env.DB.prepare(
      `SELECT COALESCE(AVG(sessions), 0) AS sessions,
              COALESCE(AVG(bounce_rate), 0) AS bounce_rate,
              COALESCE(SUM(conversions), 0) AS conversions
       FROM GA4_Metrics
       WHERE (domain_id = ?1 OR project_id = ?1)
         AND page_path = ?2
         AND date BETWEEN ?3 AND ?4`
    )
      .bind(domainId, pagePath, beforeStart, beforeEnd)
      .first<{ sessions: number; bounce_rate: number; conversions: number }>();

    const ga4After = await env.DB.prepare(
      `SELECT COALESCE(AVG(sessions), 0) AS sessions,
              COALESCE(AVG(bounce_rate), 0) AS bounce_rate,
              COALESCE(SUM(conversions), 0) AS conversions
       FROM GA4_Metrics
       WHERE (domain_id = ?1 OR project_id = ?1)
         AND page_path = ?2
         AND date BETWEEN ?3 AND ?4`
    )
      .bind(domainId, pagePath, afterStart, afterEnd)
      .first<{ sessions: number; bounce_rate: number; conversions: number }>();

    if (ga4Before && ga4After) {
      result.ga4 = {
        sessions_before: ga4Before.sessions,
        sessions_after: ga4After.sessions,
        bounce_before: ga4Before.bounce_rate,
        bounce_after: ga4After.bounce_rate,
        conversions_before: ga4Before.conversions,
        conversions_after: ga4After.conversions,
      };
    }
  } catch (err) {
    console.warn(
      `[OutcomeEvaluator] GA4 query failed for ${pagePath}: ${err instanceof Error ? err.message : err}`
    );
  }

  // ── GSC Delta ──────────────────────────────────────────────
  try {
    const gscBefore = await env.DB.prepare(
      `SELECT COALESCE(AVG(clicks), 0) AS clicks,
              COALESCE(AVG(impressions), 0) AS impressions,
              COALESCE(AVG(ctr), 0) AS ctr,
              COALESCE(AVG(position), 0) AS position
       FROM GSC_Metrics
       WHERE (domain_id = ?1 OR project_id = ?1)
         AND page = ?2
         AND date BETWEEN ?3 AND ?4`
    )
      .bind(domainId, pagePath, beforeStart, beforeEnd)
      .first<{
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>();

    const gscAfter = await env.DB.prepare(
      `SELECT COALESCE(AVG(clicks), 0) AS clicks,
              COALESCE(AVG(impressions), 0) AS impressions,
              COALESCE(AVG(ctr), 0) AS ctr,
              COALESCE(AVG(position), 0) AS position
       FROM GSC_Metrics
       WHERE (domain_id = ?1 OR project_id = ?1)
         AND page = ?2
         AND date BETWEEN ?3 AND ?4`
    )
      .bind(domainId, pagePath, afterStart, afterEnd)
      .first<{
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>();

    if (gscBefore && gscAfter) {
      result.gsc = {
        clicks_before: gscBefore.clicks,
        clicks_after: gscAfter.clicks,
        impressions_before: gscBefore.impressions,
        impressions_after: gscAfter.impressions,
        ctr_before: gscBefore.ctr,
        ctr_after: gscAfter.ctr,
        position_before: gscBefore.position,
        position_after: gscAfter.position,
      };
    }
  } catch (err) {
    console.warn(
      `[OutcomeEvaluator] GSC query failed for ${pagePath}: ${err instanceof Error ? err.message : err}`
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Helper: LLM Grading
// ─────────────────────────────────────────────────────────────

/**
 * Sends the action + analytics delta to Perplexity Sonar Pro
 * for outcome grading. The LLM returns a structured evaluation
 * with a score, lesson, and confidence level.
 */
async function gradeOutcome(
  action: ActionHistoryRow,
  delta: AnalyticsDelta,
  apiKey: string,
  env: Env
): Promise<LLMEvaluation> {
  const throttledFetch = createThrottledFetch("perplexity_chat", env.CONFIG_KV);

  // Build context for the LLM
  let analyticsContext = "No analytics data available for the affected page.";

  if (delta.ga4 || delta.gsc) {
    const parts: string[] = [];

    if (delta.ga4) {
      const g = delta.ga4;
      const sessionDelta = g.sessions_after - g.sessions_before;
      const bounceDelta = g.bounce_after - g.bounce_before;
      const convDelta = g.conversions_after - g.conversions_before;

      parts.push(
        `GA4 (page: ${delta.page_url || "unknown"}):\n` +
          `  Sessions: ${g.sessions_before.toFixed(1)} → ${g.sessions_after.toFixed(1)} (${sessionDelta >= 0 ? "+" : ""}${sessionDelta.toFixed(1)})\n` +
          `  Bounce Rate: ${g.bounce_before.toFixed(1)}% → ${g.bounce_after.toFixed(1)}% (${bounceDelta >= 0 ? "+" : ""}${bounceDelta.toFixed(1)}pp)\n` +
          `  Conversions: ${g.conversions_before} → ${g.conversions_after} (${convDelta >= 0 ? "+" : ""}${convDelta})`
      );
    }

    if (delta.gsc) {
      const s = delta.gsc;
      const clickDelta = s.clicks_after - s.clicks_before;
      const impDelta = s.impressions_after - s.impressions_before;
      const posDelta = s.position_after - s.position_before;

      parts.push(
        `Google Search Console (page: ${delta.page_url || "unknown"}):\n` +
          `  Clicks: ${s.clicks_before.toFixed(1)} → ${s.clicks_after.toFixed(1)} (${clickDelta >= 0 ? "+" : ""}${clickDelta.toFixed(1)})\n` +
          `  Impressions: ${s.impressions_before.toFixed(0)} → ${s.impressions_after.toFixed(0)} (${impDelta >= 0 ? "+" : ""}${impDelta.toFixed(0)})\n` +
          `  CTR: ${(s.ctr_before * 100).toFixed(2)}% → ${(s.ctr_after * 100).toFixed(2)}%\n` +
          `  Avg Position: ${s.position_before.toFixed(1)} → ${s.position_after.toFixed(1)} (${posDelta >= 0 ? "+" : ""}${posDelta.toFixed(1)})`
      );
    }

    analyticsContext = parts.join("\n\n");
  }

  // Build action context
  let actionContext = `Action Type: ${action.agent_type}\nAction: ${action.action}\nTaken on: ${action.created_at}`;

  if (action.snapshot_after) {
    try {
      const snap = JSON.parse(action.snapshot_after);
      // Include relevant fields without overwhelming the LLM
      const summary = Object.entries(snap)
        .filter(([, v]) => typeof v !== "object" && String(v).length < 200)
        .slice(0, 10)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      if (summary) {
        actionContext += `\nAction Details:\n${summary}`;
      }
    } catch {
      // Unparseable — skip
    }
  }

  const systemPrompt = `You are an SEO/CRO performance evaluator for the Swarme autonomous marketing platform. Your job is to objectively grade the outcome of a specific action taken by an AI agent, based on real analytics data.

GRADING SCALE:
- +100: Exceptional — dramatic improvement clearly caused by the action
- +50 to +99: Strong positive — measurable improvement with high confidence
- +15 to +49: Moderate positive — some improvement, possibly influenced by other factors
- -14 to +14: Neutral/Noise — no significant measurable impact
- -15 to -49: Moderate negative — some decline likely related to the action
- -50 to -99: Strong negative — measurable decline clearly tied to the action
- -100: Catastrophic — severe damage clearly caused by the action

CONFIDENCE LEVELS:
- "high": Sufficient analytics data, clear causal link between action and outcome
- "medium": Some data available but confounding factors possible
- "low": Minimal data, high uncertainty, or the action may not directly affect these metrics

LESSON EXTRACTION RULES:
- Write lessons as definitive rules that can be applied to future decisions.
- Be specific to the brand/domain context — avoid generic marketing truisms.
- Include the quantitative impact (e.g., "increased conversion by X%").
- Frame negative lessons as "Avoid..." and positive lessons as "Prefer..." or "When doing X, always..."
- Keep lessons to 1-2 sentences. They must be actionable and concrete.

Respond ONLY with valid JSON in this exact format:
{
  "outcome_score": <integer from -100 to 100>,
  "lesson_learned": "<the strategic rule>",
  "confidence": "<low|medium|high>",
  "reasoning": "<1-2 sentences explaining your grade>"
}`;

  const userPrompt = `Evaluate this action and its measured impact:

--- ACTION ---
${actionContext}

--- ANALYTICS DELTA (7-day before vs. 7-day after) ---
${analyticsContext}

Grade the outcome and extract a strategic lesson if the impact is significant.`;

  const response = await throttledFetch(
    "https://api.perplexity.ai/chat/completions",
    {
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
        temperature: 0.3, // Low temp for consistent grading
        max_tokens: 500,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Perplexity grading failed (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string | null } }>;
  };

  const content = data.choices[0]?.message?.content ?? "";

  // Parse the JSON response — strip markdown fences if present
  const cleaned = content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as LLMEvaluation;

    // Clamp score to valid range
    parsed.outcome_score = Math.max(
      -100,
      Math.min(100, Math.round(parsed.outcome_score))
    );

    // Validate confidence
    if (!["low", "medium", "high"].includes(parsed.confidence)) {
      parsed.confidence = "medium";
    }

    return parsed;
  } catch (parseErr) {
    // If JSON parsing fails, attempt to extract score from text
    console.warn(
      `[OutcomeEvaluator] Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}`
    );
    return {
      outcome_score: 0,
      lesson_learned: `Evaluation inconclusive for ${action.agent_type} action: ${action.action}`,
      confidence: "low",
      reasoning: "LLM response could not be parsed as structured JSON.",
    };
  }
}
