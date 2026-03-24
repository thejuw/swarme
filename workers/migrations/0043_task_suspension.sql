-- ============================================================
-- Migration 0043: Task Suspension Columns (Phase 66)
-- ============================================================
--
-- Adds columns to Agent_Tasks for intelligent task suspension.
-- When a downstream service goes down, tasks are suspended
-- instead of failed, and automatically resumed on recovery.
--
-- New columns:
--   suspension_status  — 'active' (default) or 'suspended'
--   suspension_reason  — Human-readable explanation
--   suspended_service  — Which upstream service caused the suspension
--   suspended_at       — Timestamp of suspension
-- ============================================================

ALTER TABLE Agent_Tasks ADD COLUMN suspension_status TEXT DEFAULT 'active';
ALTER TABLE Agent_Tasks ADD COLUMN suspension_reason TEXT;
ALTER TABLE Agent_Tasks ADD COLUMN suspended_service TEXT;
ALTER TABLE Agent_Tasks ADD COLUMN suspended_at TEXT;

-- Index for querying suspended tasks by service (resume sweeper)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_suspension
  ON Agent_Tasks (suspension_status, suspended_service)
  WHERE suspension_status = 'suspended';
