-- First-run onboarding state. Existing profiles are treated as already
-- onboarded; rows created after this migration start at 0 and are completed by
-- POST /api/fitness/onboarding.

ALTER TABLE fitness_profiles ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0;

UPDATE fitness_profiles SET onboarding_complete = 1;
