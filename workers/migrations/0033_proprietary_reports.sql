-- ============================================================
-- Phase 52: First-Party Data Synthesizer
-- Migration 0033: Proprietary Reports Table
-- ============================================================
--
-- Stores AI-generated proprietary research reports built from
-- aggregated first-party data. Reports go through a human-approval
-- pipeline: draft → published. Published reports are pushed to
-- the merchant's CMS via the Universal CMS Adapter (Phase 47).
-- ============================================================

CREATE TABLE IF NOT EXISTS Proprietary_Reports (
  id              TEXT PRIMARY KEY,
  domain_id       TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  data_payload    TEXT NOT NULL DEFAULT '{}',    -- JSON: aggregated metrics snapshot
  report_markdown TEXT NOT NULL DEFAULT '',       -- LLM-synthesized report body
  status          TEXT NOT NULL DEFAULT 'draft'  -- 'draft' | 'published'
                  CHECK (status IN ('draft', 'published')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- All queries MUST use domain_id (Phase 47 compartmentalization)
CREATE INDEX IF NOT EXISTS idx_proprietary_reports_domain
  ON Proprietary_Reports(domain_id, status);
