-- ============================================================
-- Phase 64: Immutable Cold Storage & Enterprise Audit Logging
-- Migration 0040: Webhook_Configs + Archive_Manifests
-- ============================================================
-- Two tables:
--
--   Webhook_Configs — Stores per-domain SIEM webhook destinations
--     (Datadog, Splunk, AWS CloudWatch, etc.). Each domain can
--     configure exactly ONE webhook URL + Bearer token pair.
--
--   Archive_Manifests — Immutable log of every cold-storage
--     archive push to R2. Provides the audit trail of what was
--     archived and when, even after D1 rows are purged.
--
-- domain_id is the partition key (Phase 47 compartmentalization).
-- ============================================================

-- ── SIEM Webhook Configuration ──────────────────────────────
-- Enterprise clients configure their webhook URL + token here.
-- The system POSTs audit events to this endpoint in real-time.

CREATE TABLE IF NOT EXISTS Webhook_Configs (
  id           TEXT PRIMARY KEY,
  domain_id    TEXT NOT NULL,
  webhook_url  TEXT NOT NULL,
  bearer_token TEXT NOT NULL,
  event_types  TEXT NOT NULL DEFAULT '["*"]',  -- JSON array of event types to forward
  is_active    INTEGER NOT NULL DEFAULT 1,
  last_sent_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One webhook config per domain (enforced at app layer, indexed for fast lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_configs_domain
  ON Webhook_Configs (domain_id);

-- ── Archive Manifests ────────────────────────────────────────
-- Every time the monthly logArchiver pushes a .jsonl to R2,
-- it inserts a manifest row here. This is the chain-of-custody
-- record for SOC 2 auditors.

CREATE TABLE IF NOT EXISTS Archive_Manifests (
  id             TEXT PRIMARY KEY,
  table_name     TEXT NOT NULL,                -- Action_History, Chaos_Logs, Chat_History
  r2_key         TEXT NOT NULL,                -- Full R2 object key (audit-archives/2026/03/...)
  record_count   INTEGER NOT NULL,
  oldest_record  TEXT NOT NULL,                -- ISO timestamp of oldest archived row
  newest_record  TEXT NOT NULL,                -- ISO timestamp of newest archived row
  byte_size      INTEGER NOT NULL DEFAULT 0,   -- Compressed .jsonl size in bytes
  sha256_hash    TEXT NOT NULL,                -- Integrity hash of the uploaded file
  archived_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_archive_manifests_table
  ON Archive_Manifests (table_name, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_archive_manifests_r2
  ON Archive_Manifests (r2_key);
