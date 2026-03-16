-- ============================================================
-- Swarme D1 Schema — Phase 4: Content Assets & Agent Type Update
-- ============================================================

-- ─── Content Assets ─────────────────────────────────────────
-- Stores generated content articles produced by the workflow.
-- Linked to the project and keyword that triggered creation.
-- Status tracks the lifecycle: Draft → Approved → Published
CREATE TABLE IF NOT EXISTS Content_Assets (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id      TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  html_content    TEXT,
  meta_description TEXT,
  seo_score       REAL DEFAULT 0.0,
  word_count      INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Approved', 'Published', 'Archived')),
  published_url   TEXT,
  cms_response_id TEXT,
  model_used      TEXT,
  tokens_used     INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_project  ON Content_Assets(project_id);
CREATE INDEX IF NOT EXISTS idx_content_status   ON Content_Assets(status);
CREATE INDEX IF NOT EXISTS idx_content_keyword  ON Content_Assets(keyword);

-- ─── Expand Agent_Tasks agent_type to support orchestrator & publisher ──
-- SQLite does not support ALTER CHECK constraints, so we recreate the table.
-- This is safe because the migration runs on a fresh DB or via wrangler d1.

-- Step 1: Create the new table with expanded CHECK
CREATE TABLE IF NOT EXISTS Agent_Tasks_v2 (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id        TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  agent_type        TEXT NOT NULL CHECK (agent_type IN ('scraper', 'writer', 'auditor', 'outreach', 'cro', 'visibility', 'orchestrator', 'publisher', 'researcher')),
  action            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Running', 'Completed', 'Failed', 'Awaiting_Approval')),
  task_description  TEXT,
  result_payload    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Copy existing data
INSERT OR IGNORE INTO Agent_Tasks_v2 (id, project_id, agent_type, action, status, task_description, result_payload, created_at, updated_at)
  SELECT id, project_id, agent_type, action, status, task_description, result_payload, created_at, updated_at
  FROM Agent_Tasks;

-- Step 3: Drop old table and rename
DROP TABLE IF EXISTS Agent_Tasks;
ALTER TABLE Agent_Tasks_v2 RENAME TO Agent_Tasks;

-- Step 4: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project   ON Agent_Tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON Agent_Tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created   ON Agent_Tasks(created_at DESC);
