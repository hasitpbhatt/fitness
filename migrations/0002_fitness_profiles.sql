-- Migration 0002: per-user fitness profile (timezone-aware days)
-- Day boundaries are stored as local dates (YYYY-MM-DD) computed in the user's
-- IANA timezone, so "today" matches the user's wall clock, not UTC.

CREATE TABLE IF NOT EXISTS fitness_profiles (
  user_id TEXT PRIMARY KEY REFERENCES freellm_users(id) ON DELETE CASCADE,
  timezone TEXT,                              -- IANA name, e.g. 'America/New_York'
  timezone_source TEXT NOT NULL DEFAULT 'auto', -- 'auto' (detected) | 'user' (confirmed)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
