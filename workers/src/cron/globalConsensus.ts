/**
 * ============================================================
 * Swarme — Phase 65: Global Consensus Engine
 * ============================================================
 *
 * "A single website's data is an anomaly; fifty websites is a fact."
 *
 * Runs every 48 hours. Scans the Unverified_Insights table for
 * clusters of semantically similar lessons reported by 10+
 * independent tenants within a 14-day window. When consensus is
 * reached, the cluster is promoted to a single definitive rule
 * in Verified_Global_Rules with a calculated confidence score.
 *
 * Clustering approach:
 *   1. Embed all unpromoted insights into Vectorize (if not yet)
 *   2. For each unassigned insight, query Vectorize for the top
 *      20 most similar insights (cosine similarity > 0.85)
 *   3. If a cluster of 10+ emerges, use the LLM to synthesize
 *      a single canonical rule from the group
 *   4. Insert into Verified_Global_Rules, mark insights as promoted
 *   5. Sync active rules to HIVE_MIND KV for edge delivery
 *
 * Schedule: Every 48 hours — runs on odd-numbered days at 02:00 UTC.
 * Cron expression: 0 2 (every-other-day) * *
 *
 * ============================================================
 */

import type { Env } from "../index";
import { generateEmbedding } from "../utils/vectorize";
import { createThrottledFetch } from "../utils/throttle";
import { syncRulesToKV } from "../utils/hiveSync";

// ── Configuration ───────────────────────────────────────────

/** Minimum independent insights needed to form consensus */
const CONSENSUS_THRESHOLD = 10;

/** Cosine similarity threshold for clustering (0.85 = very similar) */
const SIMILARITY_THRESHOLD = 0.85;

/** Only consider insights from the last N days */
const INSIGHT_WINDOW_DAYS = 14;

/** Maximum clusters to process per run (prevent timeout) */
const MAX_CLUSTERS_PER_RUN = 10;

/** Maximum unembedded insights to process per run */
const MAX_EMBED_PER_RUN = 50;

// ── Types ───────────────────────────────────────────────────

interface UnverifiedInsight {
  id: string;
  sanitized_lesson: string;
  originating_category: string;
  embedding_id: string | null;
  cluster_id: string | null;
  promoted: number;
  reported_at: string;
}

export interface ConsensusResult {
  insightsEmbedded: number;
  clustersFormed: number;
  rulesPromoted: number;
  kvSynced: boolean;
  errors: string[];
  durationMs: number;
}

// ── Main Handler ────────────────────────────────────────────

export async function handleGlobalConsensus(
  env: Env,
): Promise<ConsensusResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let insightsEmbedded = 0;
  let clustersFormed = 0;
  let rulesPromoted = 0;
  let kvSynced = false;

  const cutoffDate = new Date(
    Date.now() - INSIGHT_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  // ── Step 1: Embed any unembedded insights ─────────────────
  try {
    const unembedded = await env.DB.prepare(
      `SELECT id, sanitized_lesson FROM Unverified_Insights
       WHERE embedding_id IS NULL AND promoted = 0
       ORDER BY reported_at ASC
       LIMIT ?1`,
    )
      .bind(MAX_EMBED_PER_RUN)
      .all<{ id: string; sanitized_lesson: string }>();

    for (const row of unembedded.results ?? []) {
      try {
        const embedding = await generateEmbedding(row.sanitized_lesson, env);
        const vectorId = `hive_${row.id}`;

        await env.VECTORIZE.upsert([
          {
            id: vectorId,
            values: embedding,
            metadata: {
              type: "hive_insight",
              insight_id: row.id,
              lesson: row.sanitized_lesson.slice(0, 500),
            },
          },
        ]);

        await env.DB.prepare(
          `UPDATE Unverified_Insights SET embedding_id = ?1 WHERE id = ?2`,
        )
          .bind(vectorId, row.id)
          .run();

        insightsEmbedded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Embed failed for ${row.id}: ${msg}`);
      }
    }

    console.log(
      `[GlobalConsensus] Embedded ${insightsEmbedded} new insights`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Embedding phase failed: ${msg}`);
  }

  // ── Step 2: Cluster formation via Vectorize similarity ────
  try {
    // Get all unassigned, embedded, unpromoted insights in the window
    const candidates = await env.DB.prepare(
      `SELECT id, sanitized_lesson, originating_category, embedding_id
       FROM Unverified_Insights
       WHERE promoted = 0
         AND cluster_id IS NULL
         AND embedding_id IS NOT NULL
         AND reported_at >= ?1
       ORDER BY reported_at ASC`,
    )
      .bind(cutoffDate)
      .all<UnverifiedInsight>();

    const candidateRows = candidates.results ?? [];
    console.log(
      `[GlobalConsensus] ${candidateRows.length} candidate insights for clustering`,
    );

    // Track which insights have been assigned to a cluster this run
    const assigned = new Set<string>();
    let clustersProcessed = 0;

    for (const seed of candidateRows) {
      if (assigned.has(seed.id)) continue;
      if (clustersProcessed >= MAX_CLUSTERS_PER_RUN) break;
      if (!seed.embedding_id) continue;

      // Query Vectorize for similar insights
      const seedEmbedding = await generateEmbedding(seed.sanitized_lesson, env);
      const similar = await env.VECTORIZE.query(seedEmbedding, {
        topK: 30,
        filter: { type: "hive_insight" },
        returnMetadata: "all",
      });

      // Filter by similarity threshold and collect matching insight IDs
      const clusterMembers: Array<{ id: string; lesson: string }> = [];

      for (const match of similar.matches ?? []) {
        if ((match.score ?? 0) < SIMILARITY_THRESHOLD) continue;
        const insightId = (match.metadata as Record<string, unknown>)
          ?.insight_id as string;
        if (!insightId || assigned.has(insightId)) continue;

        // Verify it's still unpromoted and unassigned
        const row = candidateRows.find(
          (r) => r.id === insightId && !assigned.has(r.id),
        );
        if (row) {
          clusterMembers.push({
            id: row.id,
            lesson: row.sanitized_lesson,
          });
        }
      }

      // Also include the seed itself
      if (!assigned.has(seed.id)) {
        clusterMembers.unshift({
          id: seed.id,
          lesson: seed.sanitized_lesson,
        });
      }

      // Check consensus threshold
      if (clusterMembers.length < CONSENSUS_THRESHOLD) continue;

      // ── Consensus reached — synthesize a canonical rule ──
      clustersProcessed++;
      const clusterId = `cluster_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

      // Mark all members as assigned
      for (const member of clusterMembers) {
        assigned.add(member.id);
      }

      // Update cluster_id in D1
      const memberIds = clusterMembers.map((m) => m.id);
      for (let i = 0; i < memberIds.length; i += 50) {
        const chunk = memberIds.slice(i, i + 50);
        const placeholders = chunk.map((_, idx) => `?${idx + 2}`).join(", ");
        await env.DB.prepare(
          `UPDATE Unverified_Insights
           SET cluster_id = ?1
           WHERE id IN (${placeholders})`,
        )
          .bind(clusterId, ...chunk)
          .run();
      }

      clustersFormed++;

      // Synthesize the canonical rule via LLM
      const canonicalRule = await synthesizeCanonicalRule(
        clusterMembers.map((m) => m.lesson),
        env,
      );

      if (!canonicalRule) {
        errors.push(`LLM synthesis failed for cluster ${clusterId}`);
        continue;
      }

      // Calculate confidence score (base 60 + bonus for volume)
      const volumeBonus = Math.min(
        40,
        Math.floor((clusterMembers.length - CONSENSUS_THRESHOLD) * 4),
      );
      const confidenceScore = 60 + volumeBonus;

      // Determine the dominant category
      const categoryVotes: Record<string, number> = {};
      for (const member of clusterMembers) {
        const row = candidateRows.find((r) => r.id === member.id);
        const cat = row?.originating_category ?? "general";
        categoryVotes[cat] = (categoryVotes[cat] ?? 0) + 1;
      }
      const dominantCategory = Object.entries(categoryVotes).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0] ?? "general";

      // Insert verified rule
      const ruleId = `grule_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      await env.DB.prepare(
        `INSERT INTO Verified_Global_Rules
           (id, global_rule, category, confidence_score, supporting_count, cluster_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      )
        .bind(
          ruleId,
          canonicalRule,
          dominantCategory,
          confidenceScore,
          clusterMembers.length,
          clusterId,
        )
        .run();

      // Mark insights as promoted
      for (let i = 0; i < memberIds.length; i += 50) {
        const chunk = memberIds.slice(i, i + 50);
        const placeholders = chunk.map((_, idx) => `?${idx + 1}`).join(", ");
        await env.DB.prepare(
          `UPDATE Unverified_Insights SET promoted = 1 WHERE id IN (${placeholders})`,
        )
          .bind(...chunk)
          .run();
      }

      rulesPromoted++;
      console.log(
        `[GlobalConsensus] Promoted rule "${canonicalRule.slice(0, 80)}..." ` +
        `(${clusterMembers.length} supporters, confidence: ${confidenceScore})`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Clustering phase failed: ${msg}`);
    console.error(`[GlobalConsensus] Clustering error: ${msg}`);
  }

  // ── Step 3: Sync verified rules to KV ─────────────────────
  if (rulesPromoted > 0) {
    try {
      await syncRulesToKV(env);
      kvSynced = true;
      console.log("[GlobalConsensus] Synced verified rules to HIVE_MIND KV");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`KV sync failed: ${msg}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[GlobalConsensus] Complete in ${durationMs}ms — ` +
    `${insightsEmbedded} embedded, ${clustersFormed} clusters, ` +
    `${rulesPromoted} rules promoted`,
  );

  return {
    insightsEmbedded,
    clustersFormed,
    rulesPromoted,
    kvSynced,
    errors,
    durationMs,
  };
}

// ── LLM Rule Synthesis ──────────────────────────────────────

const SYNTHESIS_PROMPT = `You are a data scientist synthesizing a consensus rule from multiple independent observations. You will receive a list of similar findings reported by different organizations. Your job is to produce ONE definitive, universal rule that captures the common algorithmic insight.

RULES:
1. Output ONLY the synthesized rule as a single sentence.
2. Use imperative tone (e.g., "Add FAQ schema to product pages to increase CTR").
3. Include the approximate metric impact if consistently reported.
4. Keep it generic — it must apply universally, not to any specific brand or industry.
5. No preamble, no explanation, no caveats.

Example input:
- "Adding FAQ schema to product pages increases CTR by ~4%"
- "FAQ structured data on product listings improves click-through rate"
- "Implementing FAQ markup on product detail pages boosts CTR by 3-5%"

Example output:
"Implement FAQ schema markup on product pages to increase click-through rate by 3-5%."`;

async function synthesizeCanonicalRule(
  lessons: string[],
  env: Env,
): Promise<string | null> {
  const globalConfig = await env.CONFIG_KV.get<
    Record<string, Record<string, string>>
  >("global:config:keys", "json");
  const vaultKey = globalConfig?.ai_models?.PERPLEXITY_API_KEY;
  const apiKey =
    vaultKey && vaultKey.trim().length > 10
      ? vaultKey.trim()
      : env.PERPLEXITY_API_KEY;

  if (!apiKey) return null;

  try {
    const throttledFetch = createThrottledFetch("perplexity_chat", env.CONFIG_KV);
    const bulletList = lessons
      .slice(0, 20) // Cap to prevent token overflow
      .map((l, i) => `${i + 1}. "${l}"`)
      .join("\n");

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
            { role: "system", content: SYNTHESIS_PROMPT },
            {
              role: "user",
              content: `Synthesize ONE rule from these ${lessons.length} independent observations:\n\n${bulletList}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 200,
        }),
      },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
    };

    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error(
      `[GlobalConsensus] Synthesis failed: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return null;
  }
}
