/**
 * ============================================================
 * Swarme — Phase 65 + 65.5: Global Consensus Engine
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
 * Phase 65.5 upgrade: Full vector clustering pipeline
 *   1. Embed all unpromoted insights via Vectorize
 *   2. Retrieve embeddings for cosine-similarity-based clustering
 *   3. Greedy agglomerative clustering (distance < 0.15)
 *   4. Check unique domain count (>10) per cluster
 *   5. LLM-synthesize a 20-word canonical rule per cluster
 *   6. Push verified rule to HIVE_MIND KV
 *   7. Seed "pending" approval rows for all active domains
 *
 * Schedule: Every 48 hours at 02:00 UTC.
 * Cron expression: 0 2 (every-other-day)
 * ============================================================
 */

import type { Env } from "../index";
import { generateEmbedding } from "../utils/vectorize";
import { createThrottledFetch } from "../utils/throttle";
import { syncRulesToKV } from "../utils/hiveSync";

// ── Configuration ───────────────────────────────────────────

/** Minimum independent domains needed to form consensus */
const CONSENSUS_DOMAIN_THRESHOLD = 10;

/** Cosine distance threshold for clustering (< 0.15 = very similar) */
const CLUSTER_DISTANCE_THRESHOLD = 0.15;

/** Only consider insights from the last N days */
const INSIGHT_WINDOW_DAYS = 14;

/** Maximum clusters to process per run (prevent Worker timeout) */
const MAX_CLUSTERS_PER_RUN = 10;

/** Maximum unembedded insights to process per run */
const MAX_EMBED_PER_RUN = 50;

/** Max words in the synthesized canonical rule */
const MAX_RULE_WORDS = 20;

// ── Types ───────────────────────────────────────────────────

interface UnverifiedInsight {
  id: string;
  sanitized_lesson: string;
  originating_category: string;
  source_domain_hash: string;
  embedding_id: string | null;
  cluster_id: string | null;
  promoted: number;
  reported_at: string;
}

/** Insight enriched with its cached embedding vector */
interface EmbeddedInsight extends UnverifiedInsight {
  vector: number[];
}

export interface ConsensusResult {
  insightsEmbedded: number;
  clustersFormed: number;
  rulesPromoted: number;
  kvSynced: boolean;
  approvalRowsSeeded: number;
  errors: string[];
  durationMs: number;
}

// ── Math Utilities ──────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Cosine distance = 1 - cosine_similarity.
 * 0 means identical vectors, 2 means diametrically opposed.
 */
function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
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
  let approvalRowsSeeded = 0;

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

  // ── Step 2: Load all clusterable candidates + their vectors ─
  const embeddedInsights: EmbeddedInsight[] = [];

  try {
    const candidates = await env.DB.prepare(
      `SELECT id, sanitized_lesson, originating_category,
              COALESCE(source_domain_hash, 'unknown_' || id) as source_domain_hash,
              embedding_id, cluster_id, promoted, reported_at
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

    // Generate embeddings for each candidate (re-embed from text
    // since Vectorize doesn't expose raw vectors via query-by-id).
    // We batch this to avoid re-calling the embedding API if the
    // candidate count is large. For candidates that already have
    // an embedding_id, we still need the raw vector for local
    // cosine distance calculation.
    for (const row of candidateRows) {
      try {
        const vector = await generateEmbedding(row.sanitized_lesson, env);
        embeddedInsights.push({ ...row, vector });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Vector retrieval failed for ${row.id}: ${msg}`);
      }
    }

    console.log(
      `[GlobalConsensus] Loaded ${embeddedInsights.length} vectors for distance calculation`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Candidate loading failed: ${msg}`);
  }

  // ── Step 3: Greedy agglomerative clustering ──────────────
  //
  // Algorithm:
  //   1. Pick the first unassigned insight as a "seed"
  //   2. Scan all remaining unassigned insights
  //   3. If cosine_distance(seed, candidate) < 0.15, add to cluster
  //   4. After one full pass, check if the cluster has insights
  //      from 10+ unique domains (source_domain_hash)
  //   5. If yes → promote. If no → skip seed (may cluster later
  //      with a different seed as more insights arrive)
  //   6. Repeat from step 1 until no new clusters form or we
  //      hit MAX_CLUSTERS_PER_RUN
  //
  try {
    const assigned = new Set<string>();
    let clustersProcessed = 0;

    for (const seed of embeddedInsights) {
      if (assigned.has(seed.id)) continue;
      if (clustersProcessed >= MAX_CLUSTERS_PER_RUN) break;

      // Build the cluster around this seed
      const clusterMembers: EmbeddedInsight[] = [seed];

      for (const candidate of embeddedInsights) {
        if (candidate.id === seed.id) continue;
        if (assigned.has(candidate.id)) continue;

        const distance = cosineDistance(seed.vector, candidate.vector);
        if (distance < CLUSTER_DISTANCE_THRESHOLD) {
          clusterMembers.push(candidate);
        }
      }

      // Count unique source domains in this cluster
      const uniqueDomains = new Set(
        clusterMembers.map((m) => m.source_domain_hash),
      );

      // Must have insights from 10+ independent domains
      if (uniqueDomains.size < CONSENSUS_DOMAIN_THRESHOLD) continue;

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

      // Synthesize the canonical rule via LLM (max 20 words)
      const canonicalRule = await synthesizeCanonicalRule(
        clusterMembers.map((m) => m.sanitized_lesson),
        env,
      );

      if (!canonicalRule) {
        errors.push(`LLM synthesis failed for cluster ${clusterId}`);
        continue;
      }

      // Calculate confidence score (base 60 + bonus for domain volume)
      const volumeBonus = Math.min(
        40,
        Math.floor((uniqueDomains.size - CONSENSUS_DOMAIN_THRESHOLD) * 4),
      );
      const confidenceScore = 60 + volumeBonus;

      // Determine the dominant category
      const categoryVotes: Record<string, number> = {};
      for (const member of clusterMembers) {
        const cat = member.originating_category ?? "general";
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

      // ── Phase 65.5: Seed pending approval rows for all active domains ──
      try {
        const activeDomains = await env.DB.prepare(
          `SELECT DISTINCT domain_id FROM Brand_Context WHERE domain_id IS NOT NULL`,
        ).all<{ domain_id: string }>();

        const domains = activeDomains.results ?? [];
        for (const d of domains) {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO Global_Rule_Approvals (rule_id, domain_id, status)
             VALUES (?1, ?2, 'pending')`,
          )
            .bind(ruleId, d.domain_id)
            .run();
          approvalRowsSeeded++;
        }
      } catch (seedErr) {
        const msg = seedErr instanceof Error ? seedErr.message : String(seedErr);
        errors.push(`Approval seeding failed for rule ${ruleId}: ${msg}`);
      }

      console.log(
        `[GlobalConsensus] Promoted rule "${canonicalRule.slice(0, 80)}..." ` +
        `(${clusterMembers.length} supporters from ${uniqueDomains.size} domains, ` +
        `confidence: ${confidenceScore})`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Clustering phase failed: ${msg}`);
    console.error(`[GlobalConsensus] Clustering error: ${msg}`);
  }

  // ── Step 4: Sync verified rules to KV ─────────────────────
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
    `${rulesPromoted} rules promoted, ${approvalRowsSeeded} approval rows seeded`,
  );

  return {
    insightsEmbedded,
    clustersFormed,
    rulesPromoted,
    kvSynced,
    approvalRowsSeeded,
    errors,
    durationMs,
  };
}

// ── LLM Rule Synthesis ──────────────────────────────────────

const SYNTHESIS_PROMPT = `You are a data scientist synthesizing a consensus rule from multiple independent observations. You will receive a list of similar findings reported by different organizations. Your job is to produce ONE definitive, universal rule that captures the common algorithmic insight.

RULES:
1. Output ONLY the synthesized rule as a single sentence of ${MAX_RULE_WORDS} words or fewer.
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
              content: `Synthesize ONE rule (max ${MAX_RULE_WORDS} words) from these ${lessons.length} independent observations:\n\n${bulletList}`,
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
