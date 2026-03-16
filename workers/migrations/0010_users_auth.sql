-- ============================================================
-- Swarme D1 Schema — Phase 19: Users & Authentication
-- ============================================================

-- ─── Users ──────────────────────────────────────────────────
-- Authentication table. One row per registered human operator.
-- Passwords are hashed with PBKDF2-SHA256 + per-user salt on the edge.
CREATE TABLE IF NOT EXISTS Users (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON Users(email);

-- ─── Link Projects to Users ────────────────────────────────
-- Every project is owned by a specific authenticated user.
-- Nullable for backward compat with existing seed data.
ALTER TABLE Projects ADD COLUMN user_id TEXT REFERENCES Users(id);

CREATE INDEX IF NOT EXISTS idx_projects_user ON Projects(user_id);

-- ─── Seed: Dev user ─────────────────────────────────────────
-- Password: "swarme2026" → hashed at runtime; this seed uses a
-- placeholder that the register endpoint would produce.
-- For local dev the mock server handles auth separately.
INSERT OR IGNORE INTO Users (id, email, password_hash)
VALUES ('usr_001', 'demo@swarme.io', 'SEED_PLACEHOLDER_HASH');

-- Link existing seed projects to the demo user
UPDATE Projects SET user_id = 'usr_001' WHERE id IN ('proj_001', 'proj_002', 'proj_003');
