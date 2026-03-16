-- ============================================================
-- Phase 26: AI Manager — Perpetual Memory & Roadmap
-- ============================================================
-- Brand_Context stores the brand's perpetual memory: audience,
-- goals, tone, competitors. The AI Manager reads this before
-- every conversation turn for context continuity.
--
-- AI_Roadmap stores the AI-suggested action items that the
-- human operator must approve before the Swarm executes them.
-- ============================================================

CREATE TABLE IF NOT EXISTS Brand_Context (
  project_id   TEXT PRIMARY KEY,
  target_audience TEXT DEFAULT '',
  core_goals   TEXT DEFAULT '',
  tone_of_voice TEXT DEFAULT '',
  competitors  TEXT DEFAULT '',
  last_updated DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS AI_Roadmap (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  priority     TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
  status       TEXT NOT NULL DEFAULT 'Suggested' CHECK (status IN ('Suggested', 'Approved', 'In_Progress', 'Completed')),
  action_payload TEXT DEFAULT '{}',
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_roadmap_project ON AI_Roadmap(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_roadmap_status ON AI_Roadmap(status);
