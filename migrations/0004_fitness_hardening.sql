-- 0004_fitness_hardening.sql
-- Hardening for bookkeeping introduced in 0001/0003.
--
-- Preflight (must return zero rows before applying):
--   SELECT user_id, badge_code, COUNT(*) AS c
--   FROM user_badges GROUP BY user_id, badge_code HAVING c > 1;
--
-- Verified in production on 2026-10-19: user_badges had 1 row, no duplicates.

-- One award per user per badge. Concurrent streak updates previously did a
-- read-then-insert and could produce duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_badges_user_code
  ON user_badges(user_id, badge_code);
