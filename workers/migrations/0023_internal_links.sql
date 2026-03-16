-- =============================================
-- Phase 39: Internal Links (Semantic Link Graph)
-- =============================================

CREATE TABLE IF NOT EXISTS Internal_Links (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_id    TEXT NOT NULL,
  source_asset_id TEXT NOT NULL,
  target_asset_id TEXT NOT NULL,
  anchor_text   TEXT NOT NULL,
  similarity_score REAL NOT NULL DEFAULT 0.0,
  injected_at   TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed', 'broken')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_asset_id) REFERENCES Content_Assets(id),
  FOREIGN KEY (target_asset_id) REFERENCES Content_Assets(id)
);

CREATE INDEX IF NOT EXISTS idx_internal_links_project ON Internal_Links(project_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_source  ON Internal_Links(source_asset_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_target  ON Internal_Links(target_asset_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_status  ON Internal_Links(status);
