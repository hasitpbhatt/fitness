-- 0006_macro_targets.sql
-- Per-entry macros plus daily nutrition targets.
--
-- Preflight (must return zero rows before applying):
--   SELECT user_id, recorded_at, type, COUNT(*) AS c
--   FROM fitness_logs GROUP BY user_id, recorded_at, type HAVING c > 1;

ALTER TABLE fitness_logs ADD COLUMN protein_g REAL;
ALTER TABLE fitness_logs ADD COLUMN carbs_g REAL;
ALTER TABLE fitness_logs ADD COLUMN fat_g REAL;

ALTER TABLE fitness_profiles ADD COLUMN calorie_target INTEGER;
ALTER TABLE fitness_profiles ADD COLUMN protein_target_g REAL;
ALTER TABLE fitness_profiles ADD COLUMN carbs_target_g REAL;
ALTER TABLE fitness_profiles ADD COLUMN fat_target_g REAL;
