/**
 * ============================================================
 * Phase 51.5: Swarme Credit System — Check & Deduction Logic
 * ============================================================
 *
 * Closed-loop credit ledger utilities. Swarme Credits are
 * non-refundable digital software licenses used to provision
 * compute power, API calls, and managed external services.
 *
 * 1 Credit = 1 unit of purchasing power (integer storage).
 * Credits are NOT currency and carry no cash-out value.
 *
 * Key functions:
 *   - getOrCreateBalance(domainId) → ensures a credit balance exists
 *   - deductCredits(domainId, amount, description, referenceId)
 *       → ACID deduction with InsufficientCreditsError
 *   - depositCredits(domainId, amount, description, referenceId)
 *       → positive credit entry
 *   - getBalanceWithHistory(domainId) → balance + recent ledger entries
 *
 * All D1 queries use parameterized inputs (Phase 47 constraint).
 * All queries filter by domain_id for compartmentalization.
 * ============================================================
 */

import type { Env } from "../index";
import { checkExecutionCap, recordFailedAttempt } from "./executionCap";

// ── Types ────────────────────────────────────────────────────

export interface CreditBalance {
  id: string;
  domain_id: string;
  available_credits: number;
  auto_recharge_enabled: number;
  recharge_threshold_credits: number;
  recharge_amount_credits: number;
  stripe_customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreditLedgerEntry {
  id: string;
  balance_id: string;
  credit_amount: number;
  description: string;
  reference_id: string;
  created_at: string;
}

// ── Custom Error ─────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  public readonly required_credits: number;
  public readonly available_credits: number;

  constructor(required: number, available: number) {
    super(
      `Insufficient credits: requires ${required} but only ${available} available`
    );
    this.name = "InsufficientCreditsError";
    this.required_credits = required;
    this.available_credits = available;
  }
}

// Keep legacy alias for backward compatibility in existing catch blocks
export const InsufficientFundsError = InsufficientCreditsError;

// ── Get or Create Balance ────────────────────────────────────

export async function getOrCreateBalance(
  env: Env,
  domainId: string
): Promise<CreditBalance> {
  const existing = await env.DB.prepare(
    "SELECT * FROM Credit_Balances WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<CreditBalance>();

  if (existing) return existing;

  // Create new balance with zero credits
  const balanceId = `cb_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO Credit_Balances (id, domain_id, available_credits, auto_recharge_enabled, recharge_threshold_credits, recharge_amount_credits, created_at, updated_at)
     VALUES (?1, ?2, 0, 0, 5000, 25000, ?3, ?3)`
  )
    .bind(balanceId, domainId, now)
    .run();

  return {
    id: balanceId,
    domain_id: domainId,
    available_credits: 0,
    auto_recharge_enabled: 0,
    recharge_threshold_credits: 5000,
    recharge_amount_credits: 25000,
    stripe_customer_id: "",
    created_at: now,
    updated_at: now,
  };
}

// Legacy alias
export const getOrCreateWallet = getOrCreateBalance;

// ── Deduct Credits (ACID) ────────────────────────────────────

/**
 * Atomically deduct credits from a domain's balance.
 *
 * Uses D1 batch for transactional guarantees:
 *   1. Read current balance
 *   2. Verify sufficient credits (throw InsufficientCreditsError if not)
 *   3. Insert negative ledger entry
 *   4. Update balance
 *
 * @throws InsufficientCreditsError if available_credits < amount
 */
export async function deductCredits(
  env: Env,
  domainId: string,
  amount: number,
  description: string,
  referenceId: string
): Promise<{ new_balance: number; transaction_id: string }> {
  // Phase 57.2: Kill-switch check before any paid action
  await checkExecutionCap(env, domainId, "credit_deduction");

  // 1. Read current balance
  const balance = await env.DB.prepare(
    "SELECT id, available_credits FROM Credit_Balances WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<{ id: string; available_credits: number }>();

  if (!balance) {
    throw new Error(`No credit balance found for domain ${domainId}`);
  }

  // 2. Verify sufficient credits
  if (balance.available_credits < amount) {
    // Record the failure for kill-switch tracking
    await recordFailedAttempt(env, domainId, "credit_deduction", "Insufficient credits");
    throw new InsufficientCreditsError(amount, balance.available_credits);
  }

  // 3+4. Insert ledger entry + update balance atomically via D1 batch
  const txnId = `txn_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();
  const newBalance = balance.available_credits - amount;

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO Credit_Ledger (id, balance_id, credit_amount, description, reference_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(txnId, balance.id, -amount, description, referenceId, now),

      env.DB.prepare(
        `UPDATE Credit_Balances SET available_credits = ?1, updated_at = ?2 WHERE id = ?3 AND domain_id = ?4`
      ).bind(newBalance, now, balance.id, domainId),
    ]);
  } catch (err) {
    // Record the failure for kill-switch tracking
    await recordFailedAttempt(
      env, domainId, "credit_deduction",
      err instanceof Error ? err.message : "D1 batch error",
    );
    throw err;
  }

  return { new_balance: newBalance, transaction_id: txnId };
}

// Legacy alias
export const deductFunds = deductCredits;

// ── Deposit Credits ──────────────────────────────────────────

/**
 * Credit units to a domain's balance (e.g., Stripe purchase, auto-recharge).
 */
export async function depositCredits(
  env: Env,
  domainId: string,
  amount: number,
  description: string,
  referenceId: string
): Promise<{ new_balance: number; transaction_id: string }> {
  const balance = await getOrCreateBalance(env, domainId);

  const txnId = `txn_${crypto.randomUUID().split("-")[0]}`;
  const now = new Date().toISOString();
  const newBalance = balance.available_credits + amount;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO Credit_Ledger (id, balance_id, credit_amount, description, reference_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(txnId, balance.id, amount, description, referenceId, now),

    env.DB.prepare(
      `UPDATE Credit_Balances SET available_credits = ?1, updated_at = ?2 WHERE id = ?3 AND domain_id = ?4`
    ).bind(newBalance, now, balance.id, domainId),
  ]);

  return { new_balance: newBalance, transaction_id: txnId };
}

// Legacy alias
export const depositFunds = depositCredits;

// ── Get Balance with History ─────────────────────────────────

export async function getBalanceWithHistory(
  env: Env,
  domainId: string,
  limit = 50
): Promise<{
  balance: CreditBalance;
  ledger: CreditLedgerEntry[];
}> {
  const balance = await getOrCreateBalance(env, domainId);

  const { results } = await env.DB.prepare(
    `SELECT id, balance_id, credit_amount, description, reference_id, created_at
     FROM Credit_Ledger
     WHERE balance_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`
  )
    .bind(balance.id, limit)
    .all<CreditLedgerEntry>();

  return {
    balance,
    ledger: results || [],
  };
}

// Legacy alias
export const getWalletWithHistory = getBalanceWithHistory;

// ── Update Balance Settings ──────────────────────────────────

export async function updateBalanceSettings(
  env: Env,
  domainId: string,
  settings: {
    auto_recharge_enabled?: boolean;
    recharge_threshold_credits?: number;
    recharge_amount_credits?: number;
  }
): Promise<CreditBalance> {
  const balance = await getOrCreateBalance(env, domainId);

  const sets: string[] = [];
  const binds: (string | number)[] = [];
  let idx = 1;

  if (typeof settings.auto_recharge_enabled === "boolean") {
    sets.push(`auto_recharge_enabled = ?${idx}`);
    binds.push(settings.auto_recharge_enabled ? 1 : 0);
    idx++;
  }
  if (typeof settings.recharge_threshold_credits === "number") {
    sets.push(`recharge_threshold_credits = ?${idx}`);
    binds.push(settings.recharge_threshold_credits);
    idx++;
  }
  if (typeof settings.recharge_amount_credits === "number") {
    sets.push(`recharge_amount_credits = ?${idx}`);
    binds.push(settings.recharge_amount_credits);
    idx++;
  }

  if (sets.length === 0) return balance;

  const now = new Date().toISOString();
  sets.push(`updated_at = ?${idx}`);
  binds.push(now);
  idx++;

  binds.push(balance.id);
  binds.push(domainId);

  await env.DB.prepare(
    `UPDATE Credit_Balances SET ${sets.join(", ")} WHERE id = ?${idx} AND domain_id = ?${idx + 1}`
  )
    .bind(...binds)
    .run();

  return (await env.DB.prepare(
    "SELECT * FROM Credit_Balances WHERE domain_id = ?1"
  )
    .bind(domainId)
    .first<CreditBalance>())!;
}

// Legacy alias
export const updateWalletSettings = updateBalanceSettings;
