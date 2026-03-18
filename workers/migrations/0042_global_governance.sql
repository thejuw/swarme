-- ============================================================
-- Phase 65.5: Global Governance — Human-in-the-Loop Opt-In
-- Migration 0042: Global Rule Approvals + Domain Hash Column
-- ============================================================
--
-- Two changes:
--
-- 1. Global_Rule_Approvals table — Enterprise governance layer.
--    Global Rules from the Hive Mind network are NOT auto-applied
--    to any tenant. Each domain must explicitly approve or reject
--    each rule before the AI Manager is allowed to read it.
--
-- 2. source_domain_hash column on Unverified_Insights — A one-way
--    SHA-256 hash of the originating domain_id. This enables the
--    consensus engine to count unique contributing domains without
--    revealing any tenant identity. The hash is irreversible.
-- ============================================================

CREATE TABLE IF NOT EXISTS Global_Rule_Approvals (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  rule_id      TEXT NOT NULL,      -- FK → Verified_Global_Rules.id
  domain_id    TEXT NOT NULL,      -- The tenant domain (strict compartment key)
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  TEXT,               -- Email of the admin who reviewed
  reviewed_at  TEXT,               -- ISO datetime of review
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unique constraint: one approval record per rule per domain
CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_approvals_unique
  ON Global_Rule_Approvals (rule_id, domain_id);

-- Fast lookup: get all approved rules for a specific domain
CREATE INDEX IF NOT EXISTS idx_rule_approvals_domain_status
  ON Global_Rule_Approvals (domain_id, status);

-- Fast lookup: get all pending rules for a specific domain
CREATE INDEX IF NOT EXISTS idx_rule_approvals_pending
  ON Global_Rule_Approvals (domain_id, status)
  WHERE status = 'pending';

-- ── Unverified_Insights: Add source_domain_hash ─────────────
-- One-way SHA-256 hash of the originating domain_id.
-- Allows the consensus engine to count unique contributing
-- domains without revealing tenant identity.

ALTER TABLE Unverified_Insights
  ADD COLUMN source_domain_hash TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_unverified_insights_domain_hash
  ON Unverified_Insights (source_domain_hash)
  WHERE source_domain_hash IS NOT NULL;
