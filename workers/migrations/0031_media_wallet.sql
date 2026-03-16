-- ============================================================
-- Phase 51: Media Wallet & Auto-Recharge Engine
-- ============================================================
-- All monetary values stored as INTEGER cents to avoid
-- floating-point arithmetic errors. domain_id is UNIQUE —
-- one wallet per domain for strict compartmentalization.
-- ============================================================

CREATE TABLE IF NOT EXISTS Wallets (
    id                      TEXT PRIMARY KEY,
    domain_id               TEXT NOT NULL UNIQUE,
    balance_cents           INTEGER NOT NULL DEFAULT 0,
    auto_recharge_enabled   INTEGER NOT NULL DEFAULT 0,
    recharge_threshold_cents INTEGER DEFAULT 5000,
    recharge_amount_cents   INTEGER DEFAULT 25000,
    stripe_customer_id      TEXT DEFAULT '',
    created_at              DATETIME DEFAULT (datetime('now')),
    updated_at              DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Wallet_Transactions (
    id              TEXT PRIMARY KEY,
    wallet_id       TEXT NOT NULL,
    amount_cents    INTEGER NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    reference_id    TEXT DEFAULT '',
    created_at      DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (wallet_id) REFERENCES Wallets(id)
);

-- Fast lookup: transactions by wallet (for history table)
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet
    ON Wallet_Transactions(wallet_id, created_at DESC);

-- Fast lookup: wallets needing recharge (cron query)
CREATE INDEX IF NOT EXISTS idx_wallet_recharge
    ON Wallets(auto_recharge_enabled, balance_cents);
