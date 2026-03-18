-- ============================================================
-- Migration 0038: Idempotency Keys & Workflow Checkpoints
-- Phase 62 — Worker Idempotency & Workflow Checkpointing
-- ============================================================
--
-- Purpose:
--   Prevents autonomous agents from repeating completed tasks.
--   Every background worker action (article rewrite, outreach
--   email, decay reversal, etc.) must claim an idempotency key
--   BEFORE executing. If the key already exists with status
--   'completed', the worker aborts immediately.
--
-- The "Ghost-Task Sweeper" cron (deadLetter.ts) resets rows
-- stuck in 'processing' for >10 minutes, preventing permanent
-- task lockout from crashed workers.
-- ============================================================

-- ─── Idempotency Ledger ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS Idempotency_Keys (
  idempotency_key  TEXT    PRIMARY KEY,
  domain_id        TEXT    NOT NULL,
  task_type        TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'processing'
                          CHECK (status IN ('processing', 'completed', 'failed')),
  result_payload   TEXT,                           -- optional JSON result for debugging
  claimed_at       DATETIME NOT NULL DEFAULT (datetime('now')),
  completed_at     DATETIME,
  expires_at       DATETIME NOT NULL,
  created_at       DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Fast lookup for the dead-letter sweeper: find stuck 'processing' rows
CREATE INDEX IF NOT EXISTS idx_idem_status_claimed
  ON Idempotency_Keys (status, claimed_at)
  WHERE status = 'processing';

-- Fast lookup per domain for audit / dashboard queries
CREATE INDEX IF NOT EXISTS idx_idem_domain_type
  ON Idempotency_Keys (domain_id, task_type, created_at);

-- Auto-cleanup: the sweeper can also purge expired rows
CREATE INDEX IF NOT EXISTS idx_idem_expires
  ON Idempotency_Keys (expires_at)
  WHERE status IN ('completed', 'failed');
