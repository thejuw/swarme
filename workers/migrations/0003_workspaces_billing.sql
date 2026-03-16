-- ============================================================
-- Swarme D1 Schema — Phase 7: Workspaces, Billing & CMS Config
-- ============================================================

-- ─── Workspaces ─────────────────────────────────────────────
-- A Workspace is the top-level billing entity (one per customer).
-- Projects belong to a workspace. Stripe billing attaches here.
CREATE TABLE IF NOT EXISTS Workspaces (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name                  TEXT NOT NULL,
  owner_email           TEXT NOT NULL,
  stripe_customer_id    TEXT,
  subscription_status   TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'canceled', 'trialing')),
  plan                  TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'growth', 'enterprise')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_stripe ON Workspaces(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_ws_email  ON Workspaces(owner_email);

-- ─── Link Projects to Workspaces ────────────────────────────
-- Add workspace_id FK to existing Projects table.
-- Nullable for backward compat with seed data.
ALTER TABLE Projects ADD COLUMN workspace_id TEXT REFERENCES Workspaces(id);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON Projects(workspace_id);

-- ─── Seed: Default workspace for dev ────────────────────────
INSERT OR IGNORE INTO Workspaces (id, name, owner_email, subscription_status, plan)
VALUES
  ('ws_001', 'Sartelle Atelier', 'marie@sartelle-atelier.com', 'active', 'growth'),
  ('ws_002', 'Swarme HQ', 'team@swarme.io', 'active', 'growth');

-- Link existing seed projects to workspaces
UPDATE Projects SET workspace_id = 'ws_002' WHERE id IN ('proj_001', 'proj_002', 'proj_003');
