-- ============================================================
-- Phase 54: Chaos Swarm — Automated Red Teaming & Fuzzing
-- Migration 0034: Chaos_Logs table
-- ============================================================

CREATE TABLE IF NOT EXISTS Chaos_Logs (
  id             TEXT PRIMARY KEY,
  domain_id      TEXT NOT NULL,
  test_type      TEXT NOT NULL CHECK (test_type IN ('api_fuzz', 'race_condition', 'prompt_injection', 'xss_escape')),
  severity       TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  test_name      TEXT NOT NULL,
  payload        TEXT,
  expected       TEXT,
  actual         TEXT,
  passed         INTEGER NOT NULL DEFAULT 1,
  metadata       TEXT,
  run_id         TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_chaos_logs_domain   ON Chaos_Logs(domain_id);
CREATE INDEX idx_chaos_logs_run      ON Chaos_Logs(run_id);
CREATE INDEX idx_chaos_logs_type     ON Chaos_Logs(test_type);
CREATE INDEX idx_chaos_logs_severity ON Chaos_Logs(severity, passed);
