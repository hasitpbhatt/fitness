import type { Bindings } from './types'
import { isValidTimezone } from './time'

export type FitnessProfile = {
  timezone: string | null
  timezone_source: 'auto' | 'user'
  onboarding_complete: boolean
  freellm_key_hash: string | null
  freellm_key_updated_at: number | null
}

export async function getFitnessProfile(env: Bindings, userId: string): Promise<FitnessProfile | null> {
  const row = await env.DB.prepare(
    'SELECT timezone, timezone_source, onboarding_complete, freellm_key_hash, freellm_key_updated_at FROM fitness_profiles WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ timezone: string | null; timezone_source: string | null; onboarding_complete: number | null; freellm_key_hash: string | null; freellm_key_updated_at: number | null }>()
  if (!row) return null
  return {
    timezone: row.timezone && isValidTimezone(row.timezone) ? row.timezone : null,
    timezone_source: row.timezone_source === 'user' ? 'user' : 'auto',
    onboarding_complete: row.onboarding_complete === 1,
    freellm_key_hash: row.freellm_key_hash,
    freellm_key_updated_at: row.freellm_key_updated_at,
  }
}

export async function saveFitnessTimezone(
  env: Bindings,
  userId: string,
  timezone: string,
  source: 'auto' | 'user',
): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO fitness_profiles (user_id, timezone, timezone_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       timezone = excluded.timezone,
       timezone_source = excluded.timezone_source,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, timezone, source, now, now)
    .run()
}

/** Resolves the timezone to use for day boundaries (profile, then caller hint, then UTC). */
export async function resolveTimezone(
  env: Bindings,
  userId: string | null,
  hint?: string | null,
): Promise<string | null> {
  if (userId) {
    const profile = await getFitnessProfile(env, userId)
    if (profile?.timezone) return profile.timezone
  }
  return hint && isValidTimezone(hint) ? hint : null
}
