-- ============================================================
-- Phase 50: UGC Campaign Ledger — Immutable Memory Architecture
-- ============================================================
-- UNIQUE(product_id) prevents duplicate campaign suggestions,
-- neutralizing hallucination loops. domain_id ensures strict
-- compartmentalization (Phase 47 constraint).
-- ============================================================

CREATE TABLE IF NOT EXISTS UGC_Campaign_Ledger (
    id              TEXT PRIMARY KEY,
    domain_id       TEXT NOT NULL,
    product_id      TEXT NOT NULL UNIQUE,
    product_name    TEXT NOT NULL,
    product_url     TEXT DEFAULT '',
    product_description TEXT DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'suggested'
                        CHECK(status IN ('suggested','approved','rejected','in_progress','completed')),
    estimated_budget REAL DEFAULT 150.00,
    creator_brief   TEXT DEFAULT '',
    external_brief_id TEXT DEFAULT '',
    created_at      DATETIME DEFAULT (datetime('now')),
    updated_at      DATETIME DEFAULT (datetime('now'))
);

-- Fast lookups by domain + status (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_ugc_ledger_domain_status
    ON UGC_Campaign_Ledger(domain_id, status);
