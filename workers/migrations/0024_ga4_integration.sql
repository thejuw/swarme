-- ============================================================
-- Phase 42: GA4 Deep Data Nervous System
-- ============================================================
-- Stores GA4 OAuth tokens (separate from GSC, since GA4 uses
-- a different scope set) and caches per-URL analytics snapshots
-- pulled from the GA4 Data API (runReport).
-- ============================================================

-- Extend Users table with GA4 tokens + property ID
ALTER TABLE Users ADD COLUMN ga4_refresh_token TEXT DEFAULT NULL;
ALTER TABLE Users ADD COLUMN ga4_property_id TEXT DEFAULT NULL;

-- GA4 metrics cache — per-URL, per-device, per-date snapshot
CREATE TABLE IF NOT EXISTS GA4_Metrics (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  page_path      TEXT NOT NULL,
  device_category TEXT NOT NULL DEFAULT 'all',
  date           TEXT NOT NULL,
  sessions       INTEGER DEFAULT 0,
  bounce_rate    REAL DEFAULT 0.0,
  avg_session_duration REAL DEFAULT 0.0,
  conversions    INTEGER DEFAULT 0,
  conversion_rate REAL DEFAULT 0.0,
  country        TEXT DEFAULT '',
  created_at     DATETIME DEFAULT (datetime('now')),
  UNIQUE(project_id, page_path, device_category, date, country)
);

CREATE INDEX IF NOT EXISTS idx_ga4_metrics_project ON GA4_Metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_ga4_metrics_page ON GA4_Metrics(project_id, page_path);
CREATE INDEX IF NOT EXISTS idx_ga4_metrics_device ON GA4_Metrics(project_id, device_category);
