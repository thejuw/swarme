-- ============================================================
-- Phase 55: Enterprise RBAC — Domain_Members table
-- Migration 0035: Tenant-level role-based access control
-- ============================================================

CREATE TABLE IF NOT EXISTS Domain_Members (
  id             TEXT PRIMARY KEY,
  domain_id      TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'manager', 'viewer')),
  invited_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(domain_id, user_id)
);

CREATE INDEX idx_domain_members_domain ON Domain_Members(domain_id);
CREATE INDEX idx_domain_members_user   ON Domain_Members(user_id);
CREATE INDEX idx_domain_members_role   ON Domain_Members(domain_id, role);

-- ============================================================
-- Phase 56: Link Rot tracking — Managed_Links table
-- Stores all outbound/internal URLs injected by Swarme
-- ============================================================

CREATE TABLE IF NOT EXISTS Managed_Links (
  id             TEXT PRIMARY KEY,
  domain_id      TEXT NOT NULL,
  source_url     TEXT NOT NULL,
  target_url     TEXT NOT NULL,
  anchor_text    TEXT,
  link_type      TEXT NOT NULL DEFAULT 'outbound' CHECK (link_type IN ('outbound', 'internal')),
  last_status    INTEGER,
  last_checked   TEXT,
  replacement_url TEXT,
  is_alive       INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_managed_links_domain  ON Managed_Links(domain_id);
CREATE INDEX idx_managed_links_alive   ON Managed_Links(domain_id, is_alive);
