-- Migration 0017: Subscription Tier Gating
-- Adds plan_tier, tasks_used_this_month, and task_limit to Users table
-- for tier-based feature access control.

ALTER TABLE Users ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE Users ADD COLUMN tasks_used_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Users ADD COLUMN task_limit INTEGER NOT NULL DEFAULT 10;

-- Tier definitions:
--   free:       task_limit = 10,  no CRO, no Social
--   starter:    task_limit = 100, no CRO, no Social
--   autopilot:  task_limit = 500, full access
--   enterprise: task_limit = -1 (unlimited), full access
