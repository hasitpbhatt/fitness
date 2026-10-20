-- One row per user/type/day (closes the read-then-insert race) and an atomic
-- daily budget for AI meal estimates. Scan payloads get their own column so
-- they never overwrite a user-authored note.

ALTER TABLE fitness_logs ADD COLUMN scan_data TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fitness_logs_user_date_type
  ON fitness_logs(user_id, recorded_at, type);

CREATE TABLE IF NOT EXISTS fitness_scan_usage (
  user_id    TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
