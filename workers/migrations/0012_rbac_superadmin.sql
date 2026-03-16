-- ============================================================
-- Swarme D1 Schema — Phase 21: Superadmin RBAC
-- ============================================================

-- ─── Add role column to Users ─────────────────────────────
-- Default 'user'; only 'superadmin' can access /api/admin/*
ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- ─── Add plan and status for CRM ──────────────────────────
ALTER TABLE Users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE Users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- ─── Promote demo user to superadmin ──────────────────────
UPDATE Users SET role = 'superadmin' WHERE id = 'usr_001';

-- ─── Global Infrastructure Vault ──────────────────────────
-- Stores encrypted API keys/secrets at the platform level.
-- KV key: global:config:keys stores a JSON blob, but we also
-- keep an audit log in D1 for who changed what and when.
CREATE TABLE IF NOT EXISTS Infrastructure_Audit_Log (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  category    TEXT NOT NULL,         -- 'ai_models', 'communications', 'billing'
  key_name    TEXT NOT NULL,         -- e.g. 'OPENAI_API_KEY'
  action      TEXT NOT NULL,         -- 'set', 'rotated', 'revoked'
  actor_id    TEXT NOT NULL REFERENCES Users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_infra_audit_category ON Infrastructure_Audit_Log(category);
CREATE INDEX IF NOT EXISTS idx_infra_audit_actor ON Infrastructure_Audit_Log(actor_id);
