-- ============================================================
-- Migration 0046 — Phase 3 Audit: Unified Agent Approval System
-- ============================================================
-- Single table for ALL agent approval requests. Replaces the
-- scattered per-entity approval patterns (task approve, social
-- draft approve, decay approve) with one unified system.
--
-- Agents create approval requests here. The Mission Control
-- inbox shows all pending approvals. Humans approve/reject.
-- ============================================================

CREATE TABLE IF NOT EXISTS Agent_Approvals (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  agent_type          TEXT NOT NULL,
  action              TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  payload             TEXT DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending',
  reviewed_by         TEXT DEFAULT '',
  review_note         TEXT DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at         TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_approvals_project ON Agent_Approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON Agent_Approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_agent ON Agent_Approvals(agent_type);
CREATE INDEX IF NOT EXISTS idx_approvals_created ON Agent_Approvals(created_at);
