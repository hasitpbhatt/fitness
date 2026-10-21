-- Daily AI coach message budget. Conversations stay in the browser; only the
-- quota counter is stored server-side.

CREATE TABLE IF NOT EXISTS fitness_coach_usage (
  user_id    TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
