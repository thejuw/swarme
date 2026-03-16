-- ============================================================
-- Phase 51.5: Legal Compliance — Cash-to-Credits Refactor
-- ============================================================
-- Renames "Wallets" to "Credit_Balances" and
-- "Wallet_Transactions" to "Credit_Ledger" to establish a
-- closed-loop credit system (non-monetary, non-refundable
-- software licenses) and avoid US FinCEN Money Transmitter
-- classification.
--
-- D1/SQLite does not support ALTER TABLE RENAME COLUMN,
-- so we recreate tables with the new names and migrate data.
-- ============================================================

-- Step 1: Create new Credit_Balances table
CREATE TABLE IF NOT EXISTS Credit_Balances (
    id                       TEXT PRIMARY KEY,
    domain_id                TEXT NOT NULL UNIQUE,
    available_credits        INTEGER NOT NULL DEFAULT 0,
    auto_recharge_enabled    INTEGER NOT NULL DEFAULT 0,
    recharge_threshold_credits INTEGER DEFAULT 5000,
    recharge_amount_credits  INTEGER DEFAULT 25000,
    stripe_customer_id       TEXT DEFAULT '',
    created_at               DATETIME DEFAULT (datetime('now')),
    updated_at               DATETIME DEFAULT (datetime('now'))
);

-- Step 2: Migrate data from Wallets → Credit_Balances
INSERT OR IGNORE INTO Credit_Balances (
    id, domain_id, available_credits,
    auto_recharge_enabled, recharge_threshold_credits,
    recharge_amount_credits, stripe_customer_id,
    created_at, updated_at
)
SELECT
    id, domain_id, balance_cents,
    auto_recharge_enabled, recharge_threshold_cents,
    recharge_amount_cents, stripe_customer_id,
    created_at, updated_at
FROM Wallets;

-- Step 3: Create new Credit_Ledger table
CREATE TABLE IF NOT EXISTS Credit_Ledger (
    id              TEXT PRIMARY KEY,
    balance_id      TEXT NOT NULL,
    credit_amount   INTEGER NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    reference_id    TEXT DEFAULT '',
    created_at      DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (balance_id) REFERENCES Credit_Balances(id)
);

-- Step 4: Migrate data from Wallet_Transactions → Credit_Ledger
INSERT OR IGNORE INTO Credit_Ledger (
    id, balance_id, credit_amount,
    description, reference_id, created_at
)
SELECT
    id, wallet_id, amount_cents,
    description, reference_id, created_at
FROM Wallet_Transactions;

-- Step 5: Create indexes on new tables
CREATE INDEX IF NOT EXISTS idx_credit_ledger_balance
    ON Credit_Ledger(balance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_balance_recharge
    ON Credit_Balances(auto_recharge_enabled, available_credits);

-- Step 6: Drop legacy tables
DROP TABLE IF EXISTS Wallet_Transactions;
DROP TABLE IF EXISTS Wallets;

-- Step 7: Drop legacy indexes (now orphaned)
DROP INDEX IF EXISTS idx_wallet_txn_wallet;
DROP INDEX IF EXISTS idx_wallet_recharge;
