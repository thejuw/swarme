-- Phase 38: Outreach_Campaigns table for autonomous link-building pipeline
CREATE TABLE IF NOT EXISTS Outreach_Campaigns (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  target_url    TEXT NOT NULL,
  target_email  TEXT,
  contact_name  TEXT,
  outreach_draft TEXT,
  status        TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Approved','Sent','Replied','Bounced','Declined')),
  domain_authority INTEGER,
  relevance_score  REAL,
  sent_at       TEXT,
  replied_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES Projects(id)
);

CREATE INDEX idx_outreach_project ON Outreach_Campaigns(project_id);
CREATE INDEX idx_outreach_status  ON Outreach_Campaigns(status);
