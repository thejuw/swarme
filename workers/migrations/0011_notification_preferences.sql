-- ============================================================
-- Swarme D1 Schema — Phase 20: Notification Preferences
-- ============================================================

-- ─── Notification Preferences on Users ─────────────────────
-- Adds columns for omnichannel notifications (email + SMS).
-- notify_email defaults ON; notify_sms defaults OFF (opt-in).
ALTER TABLE Users ADD COLUMN phone_number TEXT;
ALTER TABLE Users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Users ADD COLUMN notify_sms  INTEGER NOT NULL DEFAULT 0;
