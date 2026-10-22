-- User-provided freellm API key for BYOK (Bring Your Own Key) flow.
-- When present, fitness uses the user's own freellm credits instead of the
-- shared service key. Key is stored encrypted at rest.

ALTER TABLE fitness_profiles ADD COLUMN freellm_key_hash TEXT;
ALTER TABLE fitness_profiles ADD COLUMN freellm_key_updated_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_fitness_profiles_freellm_key
  ON fitness_profiles(freellm_key_hash);