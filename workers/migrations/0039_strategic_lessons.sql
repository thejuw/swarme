-- ============================================================
-- Migration 0039: Strategic Lessons (Experience Ledger)
-- Phase 63 — Autonomous Playbook Engine (Continuous Learning Loop)
-- ============================================================
--
-- Purpose:
--   Records the Swarm's self-evaluated outcomes from past actions.
--   Each row is a "lesson" extracted by the Retrospective Agent
--   after comparing an action (from Action_History) against its
--   actual analytics impact (GA4, GSC, Stripe).
--
--   These lessons are simultaneously embedded into Vectorize so
--   the AI Manager can perform semantic recall during strategy
--   conversations — a RAG-based reinforcement learning loop.
--
-- Flow:
--   1. outcomeEvaluator.ts runs weekly (Sundays 01:00 UTC)
--   2. Queries Action_History for actions 7-14 days old
--   3. Pulls GA4/GSC analytics delta for the affected page
--   4. LLM grades the outcome (-100 to +100) and extracts a rule
--   5. Inserts into Strategic_Lessons + Vectorize embedding
--   6. aiManager.ts queries Vectorize for relevant lessons when
--      building the system prompt for new conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS Strategic_Lessons (
  id                   TEXT    PRIMARY KEY,
  domain_id            TEXT    NOT NULL,
  action_reference_id  TEXT    NOT NULL,       -- FK → Action_History.id
  action_type          TEXT    NOT NULL,        -- agent_type from the original action
  action_summary       TEXT    NOT NULL,        -- human-readable description of what was done
  page_url             TEXT,                    -- the specific URL affected (if applicable)
  outcome_score        INTEGER NOT NULL         -- -100 (catastrophic) to +100 (outstanding)
                       CHECK (outcome_score >= -100 AND outcome_score <= 100),
  analytics_delta      TEXT,                    -- JSON: { sessions_before, sessions_after, bounce_before, bounce_after, conversion_before, conversion_after, ... }
  lesson_learned       TEXT    NOT NULL,        -- the extracted strategic rule
  confidence           TEXT    NOT NULL DEFAULT 'medium'
                       CHECK (confidence IN ('low', 'medium', 'high')),
  vectorize_id         TEXT,                    -- Vectorize vector ID (for deletion/update)
  evaluated_by         TEXT    NOT NULL DEFAULT 'outcome_evaluator',
  created_at           DATETIME NOT NULL DEFAULT (datetime('now'))
);

-- Fast lookups: domain-scoped lessons ordered by recency
CREATE INDEX IF NOT EXISTS idx_lessons_domain
  ON Strategic_Lessons (domain_id, created_at DESC);

-- Lookup by action reference for deduplication
CREATE INDEX IF NOT EXISTS idx_lessons_action_ref
  ON Strategic_Lessons (action_reference_id);

-- Filter by outcome polarity (find successes or failures)
CREATE INDEX IF NOT EXISTS idx_lessons_score
  ON Strategic_Lessons (domain_id, outcome_score);
