/**
 * ============================================================
 * Swarme — Phase 65: Hive Mind KV Sync & Edge Broadcast
 * ============================================================
 *
 * The Global D1 database is too slow for 10,000 edge workers to
 * query simultaneously. This module syncs the Verified_Global_Rules
 * table into the globally-replicated HIVE_MIND KV namespace for
 * sub-millisecond reads at every edge node.
 *
 * KV key structure:
 *   hive:rules:active        — JSON array of all active rules
 *   hive:rules:{category}    — JSON array filtered by category
 *   hive:rules:meta          — Metadata (last sync, rule count)
 *   hive:rules:version       — Monotonically increasing version ID
 *
 * The AI Manager reads from `hive:rules:active` on every
 * conversation turn to inject the latest global GEO rules.
 *
 * Expiry: KV entries are set with a 72-hour TTL. If the consensus
 * engine fails to run for 3 days, stale rules silently expire
 * rather than serving outdated data forever.
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ───────────────────────────────────────────────────

export interface GlobalRule {
  id: string;
  rule: string;
  category: string;
  confidence: number;
  supporters: number;
  promoted_at: string;
}

interface VerifiedRuleRow {
  id: string;
  global_rule: string;
  category: string;
  confidence_score: number;
  supporting_count: number;
  active: number;
  promoted_at: string;
}

// ── Configuration ───────────────────────────────────────────

/** KV TTL in seconds (72 hours) */
const KV_TTL_SECONDS = 72 * 60 * 60;

/** KV key prefix */
const KEY_PREFIX = "hive:rules";

// ── Core Sync Function ──────────────────────────────────────

/**
 * syncRulesToKV — Reads all active Verified_Global_Rules from D1
 * and writes them to the HIVE_MIND KV namespace.
 *
 * Called by:
 *   - globalConsensus.ts after new rules are promoted
 *   - Admin endpoint for manual re-sync
 */
export async function syncRulesToKV(env: Env): Promise<{
  rulesSynced: number;
  categories: string[];
}> {
  // Fetch all active rules ordered by confidence
  const result = await env.DB.prepare(
    `SELECT id, global_rule, category, confidence_score, supporting_count, promoted_at
     FROM Verified_Global_Rules
     WHERE active = 1
     ORDER BY confidence_score DESC`,
  ).all<VerifiedRuleRow>();

  const rows = result.results ?? [];

  // Transform to the lightweight KV format
  const rules: GlobalRule[] = rows.map((r) => ({
    id: r.id,
    rule: r.global_rule,
    category: r.category,
    confidence: r.confidence_score,
    supporters: r.supporting_count,
    promoted_at: r.promoted_at,
  }));

  // ── Write the master list ──────────────────────────────────
  const hiveMind = env.HIVE_MIND;
  await hiveMind.put(
    `${KEY_PREFIX}:active`,
    JSON.stringify(rules),
    { expirationTtl: KV_TTL_SECONDS },
  );

  // ── Write per-category lists ───────────────────────────────
  const categories = new Set<string>();
  const byCategory: Record<string, GlobalRule[]> = {};

  for (const rule of rules) {
    categories.add(rule.category);
    if (!byCategory[rule.category]) byCategory[rule.category] = [];
    byCategory[rule.category].push(rule);
  }

  for (const [cat, catRules] of Object.entries(byCategory)) {
    await hiveMind.put(
      `${KEY_PREFIX}:${cat}`,
      JSON.stringify(catRules),
      { expirationTtl: KV_TTL_SECONDS },
    );
  }

  // ── Write metadata ─────────────────────────────────────────
  const version = Date.now().toString(36);
  await hiveMind.put(
    `${KEY_PREFIX}:meta`,
    JSON.stringify({
      last_synced: new Date().toISOString(),
      total_rules: rules.length,
      categories: Array.from(categories),
      version,
    }),
    { expirationTtl: KV_TTL_SECONDS },
  );
  await hiveMind.put(`${KEY_PREFIX}:version`, version, {
    expirationTtl: KV_TTL_SECONDS,
  });

  // ── Update kv_synced_at in D1 ──────────────────────────────
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE Verified_Global_Rules SET kv_synced_at = ?1 WHERE active = 1`,
  )
    .bind(now)
    .run();

  console.log(
    `[HiveSync] Synced ${rules.length} rules across ${categories.size} categories (v${version})`,
  );

  return {
    rulesSynced: rules.length,
    categories: Array.from(categories),
  };
}

// ── Edge Read Functions (used by AI Manager) ────────────────

/**
 * fetchGlobalRules — Read the active global rules from HIVE_MIND
 * KV. This is the primary read path for the AI Manager's
 * "Dual-Brain" system prompt injection.
 *
 * Returns rules in descending confidence order. Optionally
 * filter by category if the domain's business model is known.
 *
 * Falls back to an empty array if KV is empty or expired —
 * the AI Manager still functions, just without global rules.
 */
export async function fetchGlobalRules(
  env: Env,
  category?: string,
): Promise<GlobalRule[]> {
  try {
    const hiveMind = env.HIVE_MIND;
    const key = category
      ? `${KEY_PREFIX}:${category}`
      : `${KEY_PREFIX}:active`;

    const raw = await hiveMind.get(key);
    if (!raw) return [];

    const rules: GlobalRule[] = JSON.parse(raw);
    return rules;
  } catch (err) {
    console.warn(
      `[HiveSync] KV read failed: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return [];
  }
}

/**
 * fetchGlobalRulesMeta — Read the sync metadata (last sync time,
 * version, categories). Used by the admin dashboard.
 */
export async function fetchGlobalRulesMeta(
  env: Env,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await env.HIVE_MIND.get(`${KEY_PREFIX}:meta`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
