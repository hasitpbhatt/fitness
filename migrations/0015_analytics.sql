-- Privacy-safe product events for baseline observability. Never store photos,
-- meal descriptions, chat text, secrets, or other free-form member content here.
-- event names: scan_estimate, scan_logged, coach_reply.

CREATE TABLE IF NOT EXISTS fitness_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  surface     TEXT,
  status      INTEGER,
  error_code  TEXT,
  latency_ms  INTEGER,
  properties  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_events_name_time
  ON fitness_events(name, created_at);

CREATE INDEX IF NOT EXISTS idx_fitness_events_user_time
  ON fitness_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_fitness_events_time
  ON fitness_events(created_at);
