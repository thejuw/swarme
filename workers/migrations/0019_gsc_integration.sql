-- ============================================================
-- Migration 0019: Google Search Console Integration
-- ============================================================
-- Adds GSC OAuth tokens to Users and a GSC_Metrics table for
-- daily ingestion of clicks, impressions, CTR, and position.
-- ============================================================

-- ── User-level GSC connection ──────────────────────────────
ALTER TABLE Users ADD COLUMN gsc_refresh_token TEXT;
ALTER TABLE Users ADD COLUMN gsc_property_url TEXT;

-- ── GSC Metrics (daily ingestion target) ───────────────────
-- One row per project × date. Upserted daily by the cron sync.
CREATE TABLE IF NOT EXISTS GSC_Metrics (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id    TEXT NOT NULL REFERENCES Projects(id),
  date          TEXT NOT NULL,
  clicks        INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  ctr           REAL NOT NULL DEFAULT 0.0,
  position      REAL NOT NULL DEFAULT 0.0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unique constraint for upsert conflict resolution
CREATE UNIQUE INDEX IF NOT EXISTS idx_gsc_metrics_project_date
  ON GSC_Metrics(project_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_metrics_date
  ON GSC_Metrics(date);
