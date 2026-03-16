-- ============================================================
-- Phase 16: Autonomous CRO & Edge Telemetry
-- Migration 0007: Page_Telemetry table
-- ============================================================
--
-- Aggregates real-time behavioral data collected by the edge
-- tracker beacon (scroll depth, dwell time, CTA clicks).
-- The Swarm's CRO engine uses these signals to autonomously
-- rewrite underperforming content.
--
-- Linked to Content_Assets(id) via asset_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS Page_Telemetry (
  asset_id              TEXT      PRIMARY KEY,
  total_views           INTEGER   NOT NULL DEFAULT 0,
  avg_scroll_depth      REAL      NOT NULL DEFAULT 0.0,
  avg_dwell_time_seconds INTEGER  NOT NULL DEFAULT 0,
  cta_clicks            INTEGER   NOT NULL DEFAULT 0,
  last_optimized_at     DATETIME  DEFAULT NULL,

  -- Foreign key relationship (enforced at application layer for D1)
  -- References Content_Assets(id)

  created_at            DATETIME  NOT NULL DEFAULT (datetime('now')),
  updated_at            DATETIME  NOT NULL DEFAULT (datetime('now'))
);

-- Index for the CRO engine to find underperforming pages quickly
CREATE INDEX IF NOT EXISTS idx_telemetry_scroll
  ON Page_Telemetry (avg_scroll_depth, total_views);

CREATE INDEX IF NOT EXISTS idx_telemetry_dwell
  ON Page_Telemetry (avg_dwell_time_seconds, total_views);

-- Trigger to auto-update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_telemetry_updated
  AFTER UPDATE ON Page_Telemetry
  FOR EACH ROW
BEGIN
  UPDATE Page_Telemetry
  SET updated_at = datetime('now')
  WHERE asset_id = NEW.asset_id;
END;
