-- Phase 31: Dynamic Headless CMS & Global Control Panel
-- New tables for CMS, traffic analytics, support, and audit logging

-- ── CMS Posts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS CMS_Posts (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK(type IN ('blog', 'faq', 'feature')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  slug        TEXT,
  published   INTEGER NOT NULL DEFAULT 0,
  author_id   TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cms_posts_type ON CMS_Posts(type);
CREATE INDEX IF NOT EXISTS idx_cms_posts_published ON CMS_Posts(published);

-- ── Traffic Logs ───────────────────────────────
CREATE TABLE IF NOT EXISTS Traffic_Logs (
  id          TEXT PRIMARY KEY,
  ip_address  TEXT,
  device      TEXT,
  country     TEXT,
  referrer    TEXT,
  route       TEXT,
  user_agent  TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_created ON Traffic_Logs(created_at);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_country ON Traffic_Logs(country);

-- ── Support Tickets ────────────────────────────
CREATE TABLE IF NOT EXISTS Support_Tickets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  subject     TEXT NOT NULL,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON Support_Tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON Support_Tickets(user_id);

-- ── Admin Audit Log ────────────────────────────
CREATE TABLE IF NOT EXISTS Admin_Audit_Log (
  id          TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  metadata    TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON Admin_Audit_Log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON Admin_Audit_Log(created_at);
