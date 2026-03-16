-- ============================================================
-- Migration 0018: Stripe Customer ↔ User Link
-- ============================================================
-- Links the Stripe billing identity directly to the internal
-- Users table so webhook provisioning can resolve by customer ID.
--
-- stripe_customer_id:      Stripe "cus_xxx" — set on first checkout
-- stripe_subscription_id:  Stripe "sub_xxx" — active subscription ID
-- ============================================================

ALTER TABLE Users ADD COLUMN stripe_customer_id TEXT UNIQUE;
ALTER TABLE Users ADD COLUMN stripe_subscription_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
  ON Users(stripe_customer_id);
