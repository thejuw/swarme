-- Phase 28: Legal Infrastructure & Signup Enforcement
-- Adds terms_accepted_at column to Users table to log legal consent timestamp.

ALTER TABLE Users ADD COLUMN terms_accepted_at DATETIME;
