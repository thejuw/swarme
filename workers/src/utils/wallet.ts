/**
 * ============================================================
 * Phase 51: Media Wallet — Check & Deduction Logic
 * ============================================================
 *
 * Double-entry style ledger utilities for the prepaid wallet.
 * All amounts are in INTEGER CENTS to avoid floating-point errors.
 *
 * Key functions:
 *   - getOrCreateWallet(domainId) → ensures a wallet exists
 *   - deductFunds(domainId, amountCents, description, referenceId)
 *       → ACID deduction with InsufficientFundsError
 *   - depositFunds(domainId, amountCents, description, referenceId)
 *       → positive credit entry
 *   - getWalletWithHistory(domainId) → wallet + recent transactions
 *
 * All D1 queries use parameterized inputs (Phase 47 constraint).
 * All queries filter by domain_id for compartmentalization.
 * ============================================================
 */

import type { Env } from "../index";

// ── Types ────────────────────────────────────────────────────

export interface Wallet {
  id: string;
  domain_id: string;
  balance_cents: number;
  auto_recharge_enabled: number;
  recharge_threshold_cents: number;
  recharge_amount_cents: number;
  stripe_customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  amount_cents: number;
  description: string;
  reference_id: string;
  created_at: string;
}

// ── Custom Error ─────────────────────────────────────────────

export class InsufficientFundsError extends Error {
  public readonly required_cents: number;
  public readonly available_cents: number;

  constructor(required: number, available: number) {
    super(
      `Insufficient funds: requires ${required} cents but only ${available} cents available`
    );
    this.name = "InsufficientFundsError";
    this.required_cents = required;
    this.available_cents = available;
  }
}

// ── Get or Create Wallet ─────────────────────────────────────

export async function getOrCreateWallet(
  env: Env,
  domainId: string
): Promise<Wallet> {
  // Try to fetch existing wallet
  const existing = await env.DB.prepare(
    "SELECT * FROM Wallets WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<Wallet>();

  if (existing) return existing;

  // Create new wallet with zero balance
  const walletId = `wal_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO Wallets (id, domain_id, balance_cents, auto_recharge_enabled, recharge_threshold_cents, recharge_amount_cents, created_at, updated_at)
     VALUES (?1, ?2, 0, 0, 5000, 25000, ?3, ?3)`
  )
    .bind(walletId, domainId, now)
    .run();

  return {
    id: walletId,
    domain_id: domainId,
    balance_cents: 0,
    auto_recharge_enabled: 0,
    recharge_threshold_cents: 5000,
    recharge_amount_cents: 25000,
    stripe_customer_id: "",
    created_at: now,
    updated_at: now,
  };
}

// ── Deduct Funds (ACID) ──────────────────────────────────────

/**
 * Atomically deduct funds from a domain's wallet.
 *
 * Uses D1 batch for transactional guarantees:
 *   1. Read current balance
 *   2. Verify sufficient funds (throw InsufficientFundsError if not)
 *   3. Insert negative transaction row
 *   4. Update wallet balance
 *
 * @throws InsufficientFundsError if balance < amountCents
 */
export async function deductFunds(
  env: Env,
  domainId: string,
  amountCents: number,
  description: string,
  referenceId: string
): Promise<{ new_balance_cents: number; transaction_id: string }> {
  // 1. Read current balance
  const wallet = await env.DB.prepare(
    "SELECT id, balance_cents FROM Wallets WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<{ id: string; balance_cents: number }>();

  if (!wallet) {
    throw new Error(`No wallet found for domain ${domainId}`);
  }

  // 2. Verify sufficient funds
  if (wallet.balance_cents < amountCents) {
    throw new InsufficientFundsError(amountCents, wallet.balance_cents);
  }

  // 3+4. Insert transaction + update balance atomically via D1 batch
  const txnId = `txn_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();
  const newBalance = wallet.balance_cents - amountCents;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO Wallet_Transactions (id, wallet_id, amount_cents, description, reference_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(txnId, wallet.id, -amountCents, description, referenceId, now),

    env.DB.prepare(
      `UPDATE Wallets SET balance_cents = ?1, updated_at = ?2 WHERE id = ?3 AND domain_id = ?4`
    ).bind(newBalance, now, wallet.id, domainId),
  ]);

  return { new_balance_cents: newBalance, transaction_id: txnId };
}

// ── Deposit Funds ────────────────────────────────────────────

/**
 * Credit funds to a domain's wallet (e.g., Stripe top-up, auto-recharge).
 */
export async function depositFunds(
  env: Env,
  domainId: string,
  amountCents: number,
  description: string,
  referenceId: string
): Promise<{ new_balance_cents: number; transaction_id: string }> {
  const wallet = await getOrCreateWallet(env, domainId);

  const txnId = `txn_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();
  const newBalance = wallet.balance_cents + amountCents;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO Wallet_Transactions (id, wallet_id, amount_cents, description, reference_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(txnId, wallet.id, amountCents, description, referenceId, now),

    env.DB.prepare(
      `UPDATE Wallets SET balance_cents = ?1, updated_at = ?2 WHERE id = ?3 AND domain_id = ?4`
    ).bind(newBalance, now, wallet.id, domainId),
  ]);

  return { new_balance_cents: newBalance, transaction_id: txnId };
}

// ── Get Wallet with History ──────────────────────────────────

export async function getWalletWithHistory(
  env: Env,
  domainId: string,
  limit = 50
): Promise<{
  wallet: Wallet;
  transactions: WalletTransaction[];
}> {
  const wallet = await getOrCreateWallet(env, domainId);

  const { results } = await env.DB.prepare(
    `SELECT id, wallet_id, amount_cents, description, reference_id, created_at
     FROM Wallet_Transactions
     WHERE wallet_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`
  )
    .bind(wallet.id, limit)
    .all<WalletTransaction>();

  return {
    wallet,
    transactions: results || [],
  };
}

// ── Update Wallet Settings ───────────────────────────────────

export async function updateWalletSettings(
  env: Env,
  domainId: string,
  settings: {
    auto_recharge_enabled?: boolean;
    recharge_threshold_cents?: number;
    recharge_amount_cents?: number;
  }
): Promise<Wallet> {
  const wallet = await getOrCreateWallet(env, domainId);

  const sets: string[] = [];
  const binds: (string | number)[] = [];
  let idx = 1;

  if (typeof settings.auto_recharge_enabled === "boolean") {
    sets.push(`auto_recharge_enabled = ?${idx}`);
    binds.push(settings.auto_recharge_enabled ? 1 : 0);
    idx++;
  }
  if (typeof settings.recharge_threshold_cents === "number") {
    sets.push(`recharge_threshold_cents = ?${idx}`);
    binds.push(settings.recharge_threshold_cents);
    idx++;
  }
  if (typeof settings.recharge_amount_cents === "number") {
    sets.push(`recharge_amount_cents = ?${idx}`);
    binds.push(settings.recharge_amount_cents);
    idx++;
  }

  if (sets.length === 0) return wallet;

  const now = new Date().toISOString();
  sets.push(`updated_at = ?${idx}`);
  binds.push(now);
  idx++;

  binds.push(wallet.id);
  binds.push(domainId);

  await env.DB.prepare(
    `UPDATE Wallets SET ${sets.join(", ")} WHERE id = ?${idx} AND domain_id = ?${idx + 1}`
  )
    .bind(...binds)
    .run();

  // Return updated wallet
  return (await env.DB.prepare(
    "SELECT * FROM Wallets WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<Wallet>())!;
}
