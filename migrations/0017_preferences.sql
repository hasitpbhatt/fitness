-- Personalisation learned from coach conversations (diet, allergens, foods to
-- avoid, likes, free-text notes). Every scan, coach reply, food search and
-- meal plan reads this row so the member is never asked the same thing twice.
--
-- Only the structured, short values live here. Raw chat transcripts are never
-- stored: the coach conversation stays in the browser and only the distilled
-- preferences are persisted.

CREATE TABLE IF NOT EXISTS fitness_preferences (
  user_id    TEXT PRIMARY KEY REFERENCES freellm_users(id) ON DELETE CASCADE,
  diets      TEXT NOT NULL DEFAULT '[]',   -- JSON array: vegetarian, vegan, pescatarian, ...
  allergens  TEXT NOT NULL DEFAULT '[]',   -- JSON array: gluten, dairy, nuts, eggs, ...
  avoid      TEXT NOT NULL DEFAULT '[]',   -- JSON array of foods to avoid
  likes      TEXT NOT NULL DEFAULT '[]',   -- JSON array of foods the member enjoys
  notes      TEXT NOT NULL DEFAULT '',     -- short free-text notes ("no mushrooms")
  source     TEXT NOT NULL DEFAULT 'coach'
              CHECK (source IN ('coach', 'manual', 'onboarding')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Audit trail: every change to a member's preferences, so the app can show
-- what was learned and why, and so a wrong entry can be traced and removed.
CREATE TABLE IF NOT EXISTS fitness_preference_updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL DEFAULT 'coach',
  added      TEXT NOT NULL DEFAULT '[]',   -- JSON array of added tags
  removed    TEXT NOT NULL DEFAULT '[]',   -- JSON array of removed tags
  notes      TEXT NOT NULL DEFAULT '',     -- notes after this update
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_preference_updates_user
  ON fitness_preference_updates(user_id, created_at DESC);
