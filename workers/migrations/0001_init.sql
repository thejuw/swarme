-- ============================================================
-- Swarme D1 Schema — Phase 2: Edge Swarm Micro-Agents
-- Cloudflare D1 (SQLite dialect)
-- ============================================================

-- ─── Projects ────────────────────────────────────────────────
-- Each project represents a client domain tracked by the swarm.
CREATE TABLE IF NOT EXISTS Projects (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name            TEXT NOT NULL,
  domain          TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'copilot' CHECK (mode IN ('copilot', 'autopilot')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  visibility_score REAL DEFAULT 0.0,
  active_agents   INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Project Keywords ────────────────────────────────────────
-- Target keywords assigned to each project for visibility tracking.
CREATE TABLE IF NOT EXISTS Project_Keywords (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id  TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  keyword     TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_keywords_project ON Project_Keywords(project_id);

-- ─── Agent Tasks ─────────────────────────────────────────────
-- Every action taken (or queued) by a micro-agent.
-- Status flow: Pending → Running → Completed | Failed | Awaiting_Approval
CREATE TABLE IF NOT EXISTS Agent_Tasks (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id        TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  agent_type        TEXT NOT NULL CHECK (agent_type IN ('scraper', 'writer', 'auditor', 'outreach', 'cro', 'visibility')),
  action            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Running', 'Completed', 'Failed', 'Awaiting_Approval')),
  task_description  TEXT,
  result_payload    TEXT,  -- JSON blob for agent output
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project   ON Agent_Tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON Agent_Tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created   ON Agent_Tasks(created_at DESC);

-- ─── Visibility Logs ─────────────────────────────────────────
-- Results from the AI Visibility Checker micro-agent.
-- Each row = one keyword checked against one AI engine.
CREATE TABLE IF NOT EXISTS Visibility_Logs (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id      TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  engine          TEXT NOT NULL DEFAULT 'Perplexity' CHECK (engine IN ('Perplexity', 'ChatGPT', 'Gemini', 'Claude', 'CoPilot')),
  cited           INTEGER NOT NULL DEFAULT 0,   -- 1 = cited, 0 = not cited
  rank_position   INTEGER,                       -- Position in citations, NULL if not cited
  citation_url    TEXT,                           -- URL if cited
  checked_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vis_project  ON Visibility_Logs(project_id);
CREATE INDEX IF NOT EXISTS idx_vis_keyword  ON Visibility_Logs(keyword);
CREATE INDEX IF NOT EXISTS idx_vis_checked  ON Visibility_Logs(checked_at DESC);

-- ─── Seed data for development ───────────────────────────────
INSERT OR IGNORE INTO Projects (id, name, domain, mode, is_active, visibility_score, active_agents)
VALUES
  ('proj_001', 'Swarme Marketing', 'swarme.io', 'copilot', 1, 50.0, 12),
  ('proj_002', 'EdgeStack Blog', 'edgestack.dev', 'autopilot', 1, 72.0, 8),
  ('proj_003', 'CloudNative Hub', 'cloudnative.io', 'copilot', 0, 35.0, 0);

INSERT OR IGNORE INTO Project_Keywords (id, project_id, keyword, priority)
VALUES
  ('kw_001', 'proj_001', 'edge computing saas', 'high'),
  ('kw_002', 'proj_001', 'autonomous seo platform', 'high'),
  ('kw_003', 'proj_001', 'serverless seo tools', 'medium'),
  ('kw_004', 'proj_001', 'ai digital marketing', 'medium'),
  ('kw_005', 'proj_001', 'generative engine optimization', 'high'),
  ('kw_006', 'proj_001', 'automated link building', 'low'),
  ('kw_007', 'proj_002', 'edge serverless deployment', 'high'),
  ('kw_008', 'proj_002', 'cloudflare workers tutorial', 'medium'),
  ('kw_009', 'proj_002', 'durable objects guide', 'medium'),
  ('kw_010', 'proj_003', 'cloud native architecture', 'high');

INSERT OR IGNORE INTO Agent_Tasks (id, project_id, agent_type, action, status, task_description)
VALUES
  ('task_001', 'proj_001', 'scraper',    'SERP Analysis',     'Running',            'Parsing top 10 results for "edge computing saas"'),
  ('task_002', 'proj_001', 'writer',     'Content Draft',     'Awaiting_Approval',  'Generated pillar post: "Edge Computing in 2026"'),
  ('task_003', 'proj_001', 'auditor',    'Technical Audit',   'Completed',          'Fixed 3 broken canonical tags on /blog/*'),
  ('task_004', 'proj_001', 'cro',        'A/B Test',          'Running',            'Testing new H1 variant on /pricing — bounce rate was 74%'),
  ('task_005', 'proj_001', 'outreach',   'PR Campaign',       'Completed',          'Sent 8 personalized outreach emails for backlink acquisition'),
  ('task_006', 'proj_001', 'visibility', 'Citation Check',    'Completed',          'Checked 6 keywords across Perplexity AI'),
  ('task_007', 'proj_002', 'scraper',    'Trend Detection',   'Completed',          'Breakout term detected: "serverless seo" (velocity: 4.2x)'),
  ('task_008', 'proj_002', 'writer',     'Response Article',  'Completed',          'Auto-drafted response to trending query "ai seo tools 2026"');

INSERT OR IGNORE INTO Visibility_Logs (id, project_id, keyword, engine, cited, rank_position, citation_url)
VALUES
  ('vis_001', 'proj_001', 'edge computing saas',           'Perplexity', 1, 3, 'https://swarme.io/edge-computing'),
  ('vis_002', 'proj_001', 'autonomous seo platform',       'Perplexity', 0, NULL, NULL),
  ('vis_003', 'proj_001', 'serverless seo tools',          'ChatGPT',    1, 1, 'https://swarme.io/serverless-seo'),
  ('vis_004', 'proj_001', 'ai digital marketing',          'Perplexity', 0, NULL, NULL),
  ('vis_005', 'proj_001', 'generative engine optimization','Gemini',     1, 2, 'https://swarme.io/geo-guide'),
  ('vis_006', 'proj_001', 'automated link building',       'Perplexity', 0, NULL, NULL);
