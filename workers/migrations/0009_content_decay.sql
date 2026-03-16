-- ============================================================
-- Swarme D1 Schema — Phase 18: Content Decay Reversal Protocol
-- ============================================================
-- Adds refresh/decay-tracking columns to Content_Assets.
-- When the weekly cron detects aging content (>6 months since
-- last refresh), a refresh draft is staged for human review.
--
-- refresh_status lifecycle:
--   NULL (no refresh needed) → AWAITING_APPROVAL (draft ready)
--     → APPROVED (human approved, pushed to CMS)
--     → DISCARDED (human rejected the refresh)
-- ============================================================

-- ─── Add Refresh Columns to Content_Assets ─────────────────
ALTER TABLE Content_Assets ADD COLUMN last_refreshed_at TEXT;
ALTER TABLE Content_Assets ADD COLUMN refresh_draft_payload TEXT;
ALTER TABLE Content_Assets ADD COLUMN refresh_status TEXT CHECK (
  refresh_status IS NULL OR
  refresh_status IN ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'DISCARDED')
);

-- Index for the decay cron query (find stale content efficiently)
CREATE INDEX IF NOT EXISTS idx_content_refresh_status
  ON Content_Assets(refresh_status);

-- Composite index for the decay scan:
-- "Published articles not recently refreshed"
CREATE INDEX IF NOT EXISTS idx_content_decay_scan
  ON Content_Assets(status, created_at)
  WHERE status = 'Published';
