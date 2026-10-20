-- Migration 0001: Fitness tables on hasit-in D1 database
-- Reuses freellm_users table for identity. Fresh table names to avoid collision.

-- Fitness activity logs — one record per user per day per type
CREATE TABLE IF NOT EXISTS fitness_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('workout', 'nutrition', 'sleep', 'water', 'custom')),
  recorded_at TEXT NOT NULL,            -- ISO date string (YYYY-MM-DD)
  activity TEXT,                        -- e.g. "30 min walk", "salad", "8 hours"
  duration_min INTEGER,                 -- minutes for workout
  calories INTEGER,                     -- calorie intake (optional)
  water_ml INTEGER,                     -- water intake in ml (optional)
  sets INTEGER,                         -- workout sets
  reps INTEGER,                         -- workout reps
  weight REAL,                          -- workout weight (kg/lbs)
  hours REAL,                           -- sleep hours
  quality INTEGER,                      -- sleep quality 1-5
  label TEXT,                           -- custom label
  value TEXT,                           -- custom value
  note TEXT,
  created_at INTEGER NOT NULL,          -- unix ms
  updated_at INTEGER NOT NULL           -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_fitness_logs_user_date ON fitness_logs(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_fitness_logs_type ON fitness_logs(type);

-- Fitness goals — user-defined targets
CREATE TABLE IF NOT EXISTS fitness_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('workout', 'nutrition', 'sleep', 'water', 'custom')),
  target INTEGER NOT NULL,              -- target value
  current INTEGER NOT NULL DEFAULT 0,   -- current progress
  period TEXT NOT NULL DEFAULT 'day',   -- 'day' | 'week' | 'month'
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_goals_user ON fitness_goals(user_id);

-- Daily streaks — computed per user
CREATE TABLE IF NOT EXISTS daily_streaks (
  user_id TEXT PRIMARY KEY REFERENCES freellm_users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_checkin TEXT,                    -- ISO date string of last logged day
  streak_freeze_used INTEGER NOT NULL DEFAULT 0, -- 0 or 1
  updated_at INTEGER NOT NULL
);

-- Daily check-ins — one row per user per day they logged something
CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                   -- ISO date string
  points INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, date);

-- Achievement badges — catalog of badges users can earn
CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL,             -- e.g. 'first_log', 'streak_7', 'streak_30'
  awarded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_code ON user_badges(badge_code);

-- Badge catalog — definitions for every earnable badge
CREATE TABLE IF NOT EXISTS fitness_badges (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  rarity TEXT NOT NULL DEFAULT 'common'   -- 'common' | 'rare' | 'epic' | 'legendary'
);

INSERT OR IGNORE INTO fitness_badges (code, name, description, icon, rarity) VALUES
  ('first_log',  'First Step',        'Log your first activity',      '🥇', 'common'),
  ('streak_3',   'Three Day Streak',  'Log 3 days in a row',          '🔥', 'common'),
  ('streak_7',   'One Week Streak',   'Log 7 days in a row',          '🎯', 'rare'),
  ('streak_14',  'Two Week Streak',   'Log 14 days in a row',         '🏆', 'rare'),
  ('streak_30',  'One Month Streak',  'Log 30 days in a row',         '💎', 'epic'),
  ('streak_60',  'Two Month Streak',  'Log 60 days in a row',         '👑', 'epic'),
  ('streak_90',  'Three Month Streak','Log 90 days in a row',         '🏅', 'legendary'),
  ('streak_365', 'One Year Streak',   'Log 365 days in a row',        '🌟', 'legendary');