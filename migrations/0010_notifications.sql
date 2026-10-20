-- In-app notifications, audience targeting, and per-user view/dismiss state.
-- Push delivery is intentionally separate until VAPID keys and a dispatcher exist.

CREATE TABLE IF NOT EXISTS fitness_notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  url        TEXT,
  audience   TEXT NOT NULL DEFAULT 'all'
             CHECK (audience IN ('all', 'free', 'pro', 'enterprise', 'test')),
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled')),
  sticky     INTEGER NOT NULL DEFAULT 0,
  send_at    INTEGER,
  sent_at    INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_notifications_due
  ON fitness_notifications(status, send_at);

CREATE TABLE IF NOT EXISTS fitness_notification_views (
  notification_id TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  viewed_at       INTEGER,
  dismissed_at    INTEGER,
  PRIMARY KEY (notification_id, user_id)
);
