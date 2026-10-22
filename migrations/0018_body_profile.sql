-- Body profile and derived daily targets.
--
-- The member tells us their goal and their body; the app does the arithmetic
-- (Mifflin-St Jeor -> BMR -> TDEE -> calories, protein, fat, carbs, fibre,
-- water and weekly exercise). Nothing here is medical advice - the numbers
-- are a starting point that the member can override.

ALTER TABLE fitness_profiles ADD COLUMN goal_type TEXT
  CHECK (goal_type IS NULL OR goal_type IN ('lose', 'maintain', 'gain'));

ALTER TABLE fitness_profiles ADD COLUMN sex TEXT
  CHECK (sex IS NULL OR sex IN ('female', 'male'));

ALTER TABLE fitness_profiles ADD COLUMN birth_year INTEGER;

ALTER TABLE fitness_profiles ADD COLUMN height_cm REAL;

ALTER TABLE fitness_profiles ADD COLUMN weight_kg REAL;

ALTER TABLE fitness_profiles ADD COLUMN activity_level TEXT
  CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'athlete'));

-- Derived daily targets that were not previously tracked.
ALTER TABLE fitness_profiles ADD COLUMN fiber_target_g REAL;
ALTER TABLE fitness_profiles ADD COLUMN water_target_ml INTEGER;
ALTER TABLE fitness_profiles ADD COLUMN exercise_target_min INTEGER;

-- The inputs the calculation ran on, so the member can see and change them.
CREATE TABLE IF NOT EXISTS fitness_body_profile (
  user_id     TEXT PRIMARY KEY REFERENCES freellm_users(id) ON DELETE CASCADE,
  goal_type   TEXT NOT NULL CHECK (goal_type IN ('lose', 'maintain', 'gain')),
  sex         TEXT NOT NULL CHECK (sex IN ('female', 'male')),
  birth_year  INTEGER NOT NULL,
  height_cm   REAL NOT NULL,
  weight_kg   REAL NOT NULL,
  activity_level TEXT NOT NULL
    CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'athlete')),
  bmr         INTEGER NOT NULL,
  tdee        INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_body_profile_user
  ON fitness_body_profile(user_id);
