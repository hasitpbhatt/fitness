-- 0005_scan_ledger_and_welcome_slot.sql
-- Hardening for two edge cases:
--   1. A scan retried after local midnight must not log the same scan id twice.
--   2. The signup welcome row (type 'custom') must not consume the user's
--      one custom log slot for that day.
--
-- Preflight (must return zero rows before applying):
--   SELECT user_id, recorded_at, type, COUNT(*) AS c
--   FROM fitness_logs
--   WHERE activity IS NOT 'Welcome to fitness.hasit.in'
--   GROUP BY user_id, recorded_at, type HAVING c > 1;

-- Scan ids were only deduplicated inside the current day's JSON payload.
-- This ledger makes a scan id a per-user idempotency key across days.
CREATE TABLE IF NOT EXISTS fitness_scan_ledger (
  user_id     TEXT NOT NULL REFERENCES freellm_users(id) ON DELETE CASCADE,
  scan_id     TEXT NOT NULL,
  log_id      TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, scan_id)
);

CREATE INDEX IF NOT EXISTS idx_fitness_scan_ledger_log
  ON fitness_scan_ledger(user_id, log_id);

-- Keep the one-row-per-day guard for real user logs, but let the welcome row
-- coexist with a custom entry. The welcome row is hidden from the dashboard,
-- so it should never block something the user actually did.
DROP INDEX IF EXISTS idx_fitness_logs_user_date_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fitness_logs_user_date_type
  ON fitness_logs(user_id, recorded_at, type)
  WHERE activity IS NOT 'Welcome to fitness.hasit.in';
