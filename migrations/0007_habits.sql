-- Quick-add habit values that are not represented by a fitness_logs row.
-- Water, protein, and sleep are derived from logs; stretch lives here.

CREATE TABLE IF NOT EXISTS fitness_habits (
  user_id     TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  habit       TEXT NOT NULL,
  value       REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, recorded_at, habit)
);

CREATE INDEX IF NOT EXISTS idx_fitness_habits_user_date
  ON fitness_habits(user_id, recorded_at);
