-- ============================================================
-- Migration 0028: Developer API Key Support
-- Phase 46: Public Developer API & Key Management
-- ============================================================
-- Adds SHA-256 hashed API key storage and usage tracking to Users.
-- The raw key is shown to the user exactly once at generation time;
-- only the hash is persisted (zero-knowledge pattern).
-- ============================================================

ALTER TABLE Users ADD COLUMN api_key_hash TEXT DEFAULT '';
ALTER TABLE Users ADD COLUMN api_key_last_used DATETIME;
