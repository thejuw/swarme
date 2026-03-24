-- ============================================================
-- Migration 0045 — Phase 68: ChatOps Executive Interface
-- ============================================================
-- Three tables for the omnichannel ChatOps system:
--   ChatOps_Commands   — Audit ledger of every command received
--   ChatOps_Channels   — Registered channel configurations
--   ChatOps_Sessions   — Active conversation sessions per user
-- ============================================================

-- ─── ChatOps_Commands ────────────────────────────────────────
-- Immutable audit log of every command processed through the
-- ChatOps interface. Used for compliance, debugging, and the
-- admin panel command history view.
CREATE TABLE IF NOT EXISTS ChatOps_Commands (
  id                  TEXT PRIMARY KEY,
  intent              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'received',
  source_channel      TEXT NOT NULL,
  channel_id          TEXT NOT NULL DEFAULT '',
  user_id             TEXT NOT NULL DEFAULT '',
  user_name           TEXT DEFAULT '',
  original_text       TEXT NOT NULL,
  parameters          TEXT DEFAULT '{}',
  detail              TEXT DEFAULT '',
  parser_method       TEXT DEFAULT 'unknown',
  workflow_id         TEXT DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chatops_cmds_channel ON ChatOps_Commands(source_channel);
CREATE INDEX IF NOT EXISTS idx_chatops_cmds_intent ON ChatOps_Commands(intent);
CREATE INDEX IF NOT EXISTS idx_chatops_cmds_status ON ChatOps_Commands(status);
CREATE INDEX IF NOT EXISTS idx_chatops_cmds_user ON ChatOps_Commands(user_id);
CREATE INDEX IF NOT EXISTS idx_chatops_cmds_created ON ChatOps_Commands(created_at);

-- ─── ChatOps_Channels ────────────────────────────────────────
-- Stores configuration for each connected channel.
-- The admin panel writes here; moltworker reads from KV
-- (which is synced from these rows for edge-speed access).
CREATE TABLE IF NOT EXISTS ChatOps_Channels (
  id                  TEXT PRIMARY KEY,
  channel_type        TEXT NOT NULL,
  display_name        TEXT NOT NULL DEFAULT '',
  enabled             INTEGER NOT NULL DEFAULT 1,
  config_json         TEXT DEFAULT '{}',
  webhook_url         TEXT DEFAULT '',
  last_message_at     TEXT,
  total_commands       INTEGER DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chatops_channels_type ON ChatOps_Channels(channel_type);

-- ─── ChatOps_Sessions ────────────────────────────────────────
-- Tracks active conversation sessions. A session groups
-- consecutive messages from the same user on the same channel
-- for context continuity (future: multi-turn conversations).
CREATE TABLE IF NOT EXISTS ChatOps_Sessions (
  id                  TEXT PRIMARY KEY,
  channel_type        TEXT NOT NULL,
  channel_id          TEXT NOT NULL,
  user_id             TEXT NOT NULL,
  user_name           TEXT DEFAULT '',
  message_count       INTEGER DEFAULT 0,
  last_intent         TEXT DEFAULT '',
  context_json        TEXT DEFAULT '{}',
  started_at          TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chatops_sessions_channel ON ChatOps_Sessions(channel_type);
CREATE INDEX IF NOT EXISTS idx_chatops_sessions_user ON ChatOps_Sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chatops_sessions_active ON ChatOps_Sessions(last_active_at);

-- ─── Seed default channel configurations ─────────────────────
INSERT OR IGNORE INTO ChatOps_Channels (id, channel_type, display_name, enabled, config_json)
VALUES
  ('ch_slack',    'slack',    'Slack',          0, '{"tier":"enterprise"}'),
  ('ch_teams',    'teams',    'Microsoft Teams', 0, '{"tier":"enterprise"}'),
  ('ch_whatsapp', 'whatsapp', 'WhatsApp',       0, '{"tier":"boutique"}'),
  ('ch_telegram', 'telegram', 'Telegram',       0, '{"tier":"technical"}'),
  ('ch_discord',  'discord',  'Discord',        0, '{"tier":"technical"}'),
  ('ch_sms',      'sms',      'Twilio SMS',     0, '{"tier":"emergency"}');
