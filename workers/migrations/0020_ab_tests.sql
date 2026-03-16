-- ============================================================
-- Phase 35: Edge-Native A/B Testing Engine
-- ============================================================
-- Creates the AB_Tests table that stores split-test definitions,
-- view/conversion counters per variant, and the concluded winner.
-- The edge middleware (abSplit.ts) uses HTMLRewriter to swap DOM
-- elements at zero-flicker speed; the statistical engine reads
-- these counters to declare significance.
-- ============================================================

CREATE TABLE IF NOT EXISTS AB_Tests (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL DEFAULT 'proj_001',
  asset_id        TEXT NOT NULL,
  test_name       TEXT NOT NULL DEFAULT 'Untitled Test',
  target_selector TEXT NOT NULL DEFAULT '.cta-primary',
  variant_a_html  TEXT NOT NULL,
  variant_b_html  TEXT NOT NULL,
  views_a         INTEGER NOT NULL DEFAULT 0,
  views_b         INTEGER NOT NULL DEFAULT 0,
  conversions_a   INTEGER NOT NULL DEFAULT 0,
  conversions_b   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Running' CHECK(status IN ('Running', 'Concluded')),
  winner          TEXT CHECK(winner IN ('A', 'B', NULL)),
  min_views       INTEGER NOT NULL DEFAULT 500,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast lookups of active tests per project/asset
CREATE INDEX IF NOT EXISTS idx_ab_tests_project_status
  ON AB_Tests (project_id, status);

CREATE INDEX IF NOT EXISTS idx_ab_tests_asset
  ON AB_Tests (asset_id);
