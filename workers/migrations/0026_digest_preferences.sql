-- ============================================================
-- Phase 44: Granular User Preferences & Automated Digest Engine
-- ============================================================
-- Adds alert frequency control, SMS opt-in, and marketing
-- consent columns to the Users table. These power the cron-
-- triggered digest engine and the Settings > Notifications UI.
--
-- alert_frequency values:
--   'realtime' — Only critical errors fire immediately
--   'daily'    — Aggregated digest at 17:00 UTC daily
--   'weekly'   — Aggregated digest at 17:00 UTC every Friday
--   'muted'    — No email digests sent
--
-- receive_sms replaces the legacy notify_sms semantics with
-- a more explicit opt-in flag (Phase 20 notify_sms is preserved
-- for backward compatibility; this column governs digest SMS).
--
-- receive_marketing controls whether the user receives
-- product updates, feature announcements, and tips.
-- ============================================================

ALTER TABLE Users ADD COLUMN alert_frequency TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE Users ADD COLUMN receive_sms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Users ADD COLUMN receive_marketing INTEGER NOT NULL DEFAULT 1;
