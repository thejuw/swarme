-- ============================================================
-- Migration 0029: Domain-Centric Multi-Tenant Isolation
-- Phase 47: Universal CMS Adapters & Multi-Domain
-- ============================================================
-- Introduces the Domains table as the single source of truth
-- for multi-domain isolation. All data tables that previously
-- used project_id now ALSO carry a domain_id column for strict
-- compartmentalization. The AI must NEVER query using just
-- user_id — always domain_id.
--
-- SQLite limitation: ALTER TABLE cannot add NOT NULL without
-- a default, and cannot add FOREIGN KEY constraints. We add
-- domain_id columns with a DEFAULT and create indexes.
-- ============================================================

-- ── 1. Domains — The core multi-tenant pivot ────────────────
CREATE TABLE IF NOT EXISTS Domains (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  domain_url           TEXT NOT NULL,
  platform_type        TEXT NOT NULL DEFAULT 'custom'
    CHECK (platform_type IN (
      'wordpress', 'shopify', 'wix', 'squarespace',
      'magento', 'woocommerce', 'ghost', 'joomla',
      'drupal', 'prestashop', 'opencart', 'easywp',
      'weebly', 'godaddy', 'custom'
    )),
  credentials_vault_id TEXT DEFAULT '',
  label                TEXT DEFAULT '',
  created_at           DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_domains_user ON Domains(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_url_user ON Domains(user_id, domain_url);

-- ── 2. Add domain_id to Brand_Context ───────────────────────
ALTER TABLE Brand_Context ADD COLUMN domain_id TEXT DEFAULT '';

-- ── 3. Add domain_id to AI_Roadmap ──────────────────────────
ALTER TABLE AI_Roadmap ADD COLUMN domain_id TEXT DEFAULT '';

-- ── 4. Add domain_id to GSC_Metrics ─────────────────────────
ALTER TABLE GSC_Metrics ADD COLUMN domain_id TEXT DEFAULT '';

-- ── 5. Add domain_id to Action_History ──────────────────────
ALTER TABLE Action_History ADD COLUMN domain_id TEXT DEFAULT '';

-- ── 6. Add domain_id to Agent_Tasks ─────────────────────────
ALTER TABLE Agent_Tasks ADD COLUMN domain_id TEXT DEFAULT '';

-- ── Indexes for domain-scoped queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_brand_context_domain ON Brand_Context(domain_id);
CREATE INDEX IF NOT EXISTS idx_ai_roadmap_domain ON AI_Roadmap(domain_id);
CREATE INDEX IF NOT EXISTS idx_gsc_metrics_domain ON GSC_Metrics(domain_id);
CREATE INDEX IF NOT EXISTS idx_action_history_domain ON Action_History(domain_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_domain ON Agent_Tasks(domain_id);
