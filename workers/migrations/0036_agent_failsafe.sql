-- ============================================================
-- Phase 57: The Doomsday Protocols
-- Migration 0036: Agent_Failsafe table for infinite loop kill-switch
-- ============================================================

CREATE TABLE IF NOT EXISTS Agent_Failsafe (
  id                TEXT PRIMARY KEY,
  domain_id         TEXT NOT NULL,
  task_type         TEXT NOT NULL,
  attempt_count     INTEGER NOT NULL DEFAULT 1,
  last_attempt_at   TEXT NOT NULL DEFAULT (datetime('now')),
  blocked           INTEGER NOT NULL DEFAULT 0,
  blocked_reason    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(domain_id, task_type)
);

CREATE INDEX idx_agent_failsafe_domain    ON Agent_Failsafe(domain_id);
CREATE INDEX idx_agent_failsafe_blocked   ON Agent_Failsafe(domain_id, blocked);
CREATE INDEX idx_agent_failsafe_task      ON Agent_Failsafe(domain_id, task_type);
