-- Staff-provisioned fitness access. The freellm user tier is shared with the AI
-- product, so premium fitness access lives in its own table. Existing members
-- who already have fitness data keep access at launch; new members start free.

CREATE TABLE IF NOT EXISTS fitness_entitlements (
  user_id       TEXT PRIMARY KEY REFERENCES freellm_users(id) ON DELETE CASCADE,
  tier          TEXT NOT NULL DEFAULT 'free'
                CHECK (tier IN ('free', 'plus', 'coach')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'trial', 'revoked', 'expired')),
  trial_ends_at INTEGER,
  ends_at       INTEGER,
  granted_by    TEXT,
  note          TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fitness_entitlements_tier
  ON fitness_entitlements(tier, status);

INSERT OR IGNORE INTO fitness_entitlements (
  user_id, tier, status, note, created_at, updated_at
)
SELECT id, 'plus', 'active', 'Grandfathered at entitlements launch', created_at, updated_at
FROM freellm_users
WHERE id IN (
  SELECT user_id FROM fitness_profiles
  UNION
  SELECT user_id FROM fitness_logs
);
