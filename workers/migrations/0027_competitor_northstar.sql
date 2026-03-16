-- ============================================================
-- Phase 45: Competitor Auto-Discovery & North Star Protocol
-- ============================================================
-- auto_discovered_competitors: JSON array of real SERP competitors
--   discovered via Perplexity (e.g., [{"domain":"competitor.com","reason":"Ranks #2 for 'luxury handbags'"}])
-- north_star_url: The aspirational website the operator chooses
--   as their design/UX benchmark for CRO suggestions

ALTER TABLE Brand_Context ADD COLUMN auto_discovered_competitors TEXT DEFAULT '';
ALTER TABLE Brand_Context ADD COLUMN north_star_url TEXT DEFAULT '';
