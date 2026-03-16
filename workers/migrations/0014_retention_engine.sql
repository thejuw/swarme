-- ════════════════════════════════════════════════════════════
-- Migration 0014: Proactive Retention Engine (Phase 27)
-- ════════════════════════════════════════════════════════════
--
-- Adds:
--   1. last_login_at column to Users for churn detection
--   2. Magic_Links table for one-time passwordless auth tokens
--   3. Competitor_Scans table for proactive market intelligence
--   4. Retention_Events table for audit trail of retention actions
-- ════════════════════════════════════════════════════════════

-- 1. Add last_login_at to Users (nullable — existing users get NULL until next login)
ALTER TABLE Users ADD COLUMN last_login_at TEXT;

-- 2. Magic Links for passwordless re-engagement
CREATE TABLE IF NOT EXISTS Magic_Links (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- 3. Competitor Scans — stores results from Perplexity-powered market intelligence
CREATE TABLE IF NOT EXISTS Competitor_Scans (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  scan_type    TEXT NOT NULL DEFAULT 'market_intelligence',
  competitors  TEXT,          -- JSON array of competitor insights
  threats      TEXT,          -- JSON array of detected threats
  opportunities TEXT,         -- JSON array of opportunities
  raw_response TEXT,          -- Full API response for debugging
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES Projects(id)
);

-- 4. Retention Events — audit log for all retention actions
CREATE TABLE IF NOT EXISTS Retention_Events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  event_type  TEXT NOT NULL,  -- 'churn_risk_detected', 'winback_sent', 'magic_link_sent', 'reactivated'
  channel     TEXT,           -- 'email', 'sms', 'both'
  metadata    TEXT,           -- JSON payload with details
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES Users(id)
);
