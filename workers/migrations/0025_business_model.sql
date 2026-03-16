-- ============================================================
-- Phase 43: Multi-Vertical Business Logic
-- ============================================================
-- Adds a business_model column to Brand_Context so the Swarm
-- can tailor CRO/SEO strategies to the specific monetization
-- model of each website.
--
-- Valid values: e-commerce, lead_gen, affiliate, publisher
-- The AI Manager asks this during onboarding and persists it.
-- The CRO engine reads it to select the correct playbook.
-- ============================================================

ALTER TABLE Brand_Context ADD COLUMN business_model TEXT DEFAULT '';
