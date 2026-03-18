-- ============================================================
-- Phase 61: Persistent Conversational Memory & State Hydration
-- ============================================================
-- Two tables:
--   Chat_History   — rolling short-term transcript (last N messages per domain)
--   User_Memories  — compressed long-term facts extracted by the memory compressor
--
-- domain_id is the partition key (enforces strict tenant isolation per Phase 47).
-- ============================================================

-- ── Short-term conversational ledger ──────────────────────
-- Stores every user/assistant message for each domain.
-- The rolling context window reads the most recent 10 per domain.
-- The memory compressor archives rows older than 48 hours.

CREATE TABLE IF NOT EXISTS Chat_History (
  id          TEXT    PRIMARY KEY,
  domain_id   TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT    NOT NULL,
  compressed  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_history_domain_created
  ON Chat_History (domain_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_history_compress_candidates
  ON Chat_History (compressed, created_at)
  WHERE compressed = 0;

-- ── Long-term compressed user memories ────────────────────
-- Single-sentence facts extracted from old conversations.
-- Examples:
--   "User prefers an aggressive, direct tone in marketing copy"
--   "Primary keyword shifted from 'leather bags' to 'sustainable accessories'"
--   "User's Q2 2026 revenue goal is $500K"

CREATE TABLE IF NOT EXISTS User_Memories (
  id          TEXT    PRIMARY KEY,
  domain_id   TEXT    NOT NULL,
  memory_fact TEXT    NOT NULL,
  source      TEXT    DEFAULT 'compressor',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_memories_domain
  ON User_Memories (domain_id, created_at DESC);
