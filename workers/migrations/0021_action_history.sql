-- ============================================================
-- Phase 37 — Action History & Rollback Engine
-- ============================================================
-- Tracks every mutative action taken by AI agents so operators
-- can audit what happened and undo changes when needed.
--
-- Design decisions:
--   • `snapshot_before` stores the serialised state BEFORE the
--     action ran — this is the payload used by the rollback API.
--   • `snapshot_after` stores the state AFTER — used for diff
--     previews in the Mission Control UI.
--   • `rolled_back_at` is non-null only when a human has
--     explicitly rolled back this action.
--   • `preview_url` stores a Browser Rendering screenshot of
--     the page taken immediately after the action completed.
-- ============================================================

CREATE TABLE IF NOT EXISTS Action_History (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  agent_type      TEXT NOT NULL,          -- writer, auditor, cro, social, etc.
  action          TEXT NOT NULL,          -- human-readable label
  entity_type     TEXT NOT NULL,          -- content_asset, ab_test, social_draft, audit_finding …
  entity_id       TEXT NOT NULL,          -- FK to the entity that was mutated
  snapshot_before TEXT,                   -- JSON: full row state before mutation
  snapshot_after  TEXT,                   -- JSON: full row state after mutation
  preview_url     TEXT,                   -- URL to a Browser Rendering screenshot
  rolled_back     INTEGER DEFAULT 0,     -- 0 = active, 1 = rolled back
  rolled_back_at  TEXT,                   -- ISO timestamp of rollback
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Fast lookups: project timeline, entity audit trail, rollback candidates
CREATE INDEX IF NOT EXISTS idx_action_history_project
  ON Action_History(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_history_entity
  ON Action_History(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_action_history_rollback
  ON Action_History(rolled_back, project_id);
