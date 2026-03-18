-- ============================================================
-- Phase 65: The Global Hive Mind — Cross-Tenant Network Effects
-- Migration 0041: Swarme Global Brain tables
-- ============================================================
--
-- These tables operate in the SAME D1 database but are logically
-- separate from tenant data — they contain ONLY anonymized,
-- sanitized insights with no traceable link back to the
-- originating tenant.
--
-- Architecture:
--   1. Unverified_Insights — anonymized lessons contributed by
--      individual tenants after passing the anonymization pipeline.
--      An insight is just one data point — it could be noise.
--
--   2. Verified_Global_Rules — when 10+ independent tenants
--      report the same structural insight within 14 days, the
--      Consensus Engine promotes it here as an empirically
--      validated rule with a confidence score.
--
-- The Verified_Global_Rules are synced to a globally replicated
-- KV namespace (SWARME_HIVE_MIND) for sub-millisecond reads
-- at the edge.
-- ============================================================

-- ── Unverified Insights (raw anonymized contributions) ──────
-- Each row represents a single anonymized lesson from one tenant.
-- No domain_id, no tenant ID — fully decoupled from origin.

CREATE TABLE IF NOT EXISTS Unverified_Insights (
  id                   TEXT PRIMARY KEY,
  sanitized_lesson     TEXT NOT NULL,
  originating_category TEXT NOT NULL DEFAULT 'general',  -- ecommerce, lead_generation, affiliate, publisher, general
  embedding_id         TEXT,                              -- Vectorize vector ID for clustering
  cluster_id           TEXT,                              -- Set by consensus engine during grouping
  promoted             INTEGER NOT NULL DEFAULT 0,        -- 1 = promoted to Verified_Global_Rules
  reported_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_unverified_insights_category
  ON Unverified_Insights (originating_category, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_unverified_insights_cluster
  ON Unverified_Insights (cluster_id)
  WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unverified_insights_unpromoted
  ON Unverified_Insights (promoted, reported_at)
  WHERE promoted = 0;

-- ── Verified Global Rules (consensus-proven insights) ────────
-- Rules that have been independently confirmed by 10+ tenants.
-- These are the "laws of GEO" — empirically validated across
-- the entire Swarme network.

CREATE TABLE IF NOT EXISTS Verified_Global_Rules (
  id               TEXT PRIMARY KEY,
  global_rule      TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'general',
  confidence_score INTEGER NOT NULL DEFAULT 0,           -- 0-100 scale
  supporting_count INTEGER NOT NULL DEFAULT 0,           -- Number of independent tenants
  active           INTEGER NOT NULL DEFAULT 1,           -- 1 = active, 0 = deprecated
  cluster_id       TEXT,                                  -- Reference to the originating cluster
  kv_synced_at     TEXT,                                  -- Last sync to HIVE_MIND KV
  promoted_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verified_rules_active
  ON Verified_Global_Rules (active, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_verified_rules_category
  ON Verified_Global_Rules (category, active);
