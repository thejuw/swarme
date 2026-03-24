-- ============================================================
-- Migration 0044 — Phase 67: Data Lakehouse Catalog Tables
-- ============================================================
-- Three tables that form the Iceberg-inspired catalog layer:
--   Data_Tables   — logical table registry (one row per event stream)
--   Data_Snapshots — immutable snapshot chain (append-only, like Iceberg manifests)
--   Data_Files     — individual R2 data files within a snapshot
--
-- Design decisions:
--   - Fully append-only snapshots (never update, only add new)
--   - Hive-partitioned R2 paths stored in Data_Files.partition_values (JSON)
--   - Column-level stats in Data_Files.column_stats (JSON) for predicate pushdown
--   - Data_Tables tracks the "current" snapshot for quick HEAD resolution
--   - All tables use TEXT primary keys (UUIDs generated in application code)
-- ============================================================

-- ─── Data_Tables ─────────────────────────────────────────────
-- Logical table registry. Each entry represents one event stream
-- (e.g., "swarme_events") stored across R2 as partitioned JSONL files.
CREATE TABLE IF NOT EXISTS Data_Tables (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  description         TEXT DEFAULT '',
  schema_json         TEXT DEFAULT '{}',
  partition_spec      TEXT DEFAULT '["year","month","day","hour"]',
  current_snapshot_id TEXT,
  total_rows          INTEGER DEFAULT 0,
  total_bytes         INTEGER DEFAULT 0,
  format              TEXT DEFAULT 'jsonl',
  retention_days      INTEGER DEFAULT 90,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_data_tables_name ON Data_Tables(name);

-- ─── Data_Snapshots ──────────────────────────────────────────
-- Immutable snapshot chain. Each export cron run creates a new snapshot.
-- parent_snapshot_id links to the previous snapshot (Iceberg-style lineage).
CREATE TABLE IF NOT EXISTS Data_Snapshots (
  id                  TEXT PRIMARY KEY,
  table_name          TEXT NOT NULL,
  parent_snapshot_id  TEXT,
  row_count           INTEGER DEFAULT 0,
  file_count          INTEGER DEFAULT 1,
  byte_size           INTEGER DEFAULT 0,
  summary_json        TEXT DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (table_name) REFERENCES Data_Tables(name)
);

CREATE INDEX IF NOT EXISTS idx_data_snapshots_table ON Data_Snapshots(table_name);
CREATE INDEX IF NOT EXISTS idx_data_snapshots_created ON Data_Snapshots(created_at);

-- ─── Data_Files ──────────────────────────────────────────────
-- Individual data files in R2 belonging to a snapshot.
-- partition_values: JSON of Hive partition keys (e.g., {"year":"2026","month":"03",...})
-- column_stats: JSON min/max/count per column for predicate pushdown.
CREATE TABLE IF NOT EXISTS Data_Files (
  id                  TEXT PRIMARY KEY,
  snapshot_id         TEXT NOT NULL,
  table_name          TEXT NOT NULL,
  r2_key              TEXT NOT NULL,
  row_count           INTEGER DEFAULT 0,
  byte_size           INTEGER DEFAULT 0,
  format              TEXT DEFAULT 'jsonl',
  partition_values    TEXT DEFAULT '{}',
  column_stats        TEXT DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (snapshot_id) REFERENCES Data_Snapshots(id),
  FOREIGN KEY (table_name) REFERENCES Data_Tables(name)
);

CREATE INDEX IF NOT EXISTS idx_data_files_snapshot ON Data_Files(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_data_files_table ON Data_Files(table_name);
CREATE INDEX IF NOT EXISTS idx_data_files_r2key ON Data_Files(r2_key);

-- ─── Seed the default event table ────────────────────────────
-- The lakehouse export cron writes to "swarme_events".
INSERT OR IGNORE INTO Data_Tables (id, name, description, schema_json, format)
VALUES (
  'tbl_swarme_events',
  'swarme_events',
  'Edge analytics events — page views, API calls, AI crawler visits, conversions',
  '{"event_type":"string","path":"string","country":"string","device_class":"string","referer_domain":"string","ip_hash":"string","method":"string","domain_id":"string","status_code":"number","response_ms":"number","content_length":"number","timestamp":"string"}',
  'jsonl'
);
