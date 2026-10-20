-- Body measurements over time. One row per user per local day.

CREATE TABLE IF NOT EXISTS fitness_measurements (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  weight_kg   REAL,
  waist_cm    REAL,
  hips_cm     REAL,
  arms_cm     REAL,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (user_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_fitness_measurements_user_date
  ON fitness_measurements(user_id, recorded_at DESC);
