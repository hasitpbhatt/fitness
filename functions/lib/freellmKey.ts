// Per-member freellm API key (BYOK), provisioned automatically.
//
// Every fitness member gets their own freellm API token, created on demand and
// stored encrypted at rest. The token is registered in the shared
// `freellm_api_tokens` table (same D1 as freellm), so calls made with it are
// metered against that member's own freellm balance instead of the shared
// service account. Members never copy or paste a key.
//
// If the member token is rejected (no credits, tier gate), the caller falls
// back to the shared service key so the feature still works.

import { decryptSecret, encryptSecret, sha256Hex } from './crypto'
import type { Bindings } from './types'

const KEY_PREFIX = 'fl_'
const TOKEN_LABEL = 'fitness'
const MIN_KEY_LENGTH = 32
const MAX_KEY_LENGTH = 200

export function isValidFreellmKey(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) return false
  if (key.length < KEY_PREFIX.length + MIN_KEY_LENGTH) return false
  if (key.length > MAX_KEY_LENGTH) return false
  return /^[A-Za-z0-9_-]+$/.test(key.slice(KEY_PREFIX.length))
}

/**
 * The passphrase used to encrypt member keys at rest. `FITNESS_DATA_KEY` is
 * preferred; the Google OAuth secret is a stable fallback so no extra
 * deployment step is required. Losing the passphrase only forces a re-issue.
 */
function encryptionPassphrase(env: Bindings): string | null {
  return env.FITNESS_DATA_KEY ?? env.GOOGLE_CLIENT_SECRET ?? null
}

function newFreellmToken(): string {
  return `${KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`
}

export async function clearFreellmKey(env: Bindings, userId: string): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE fitness_profiles
     SET freellm_key_hash = NULL, freellm_key_updated_at = NULL, updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(now, userId)
    .run()
  await env.DB.prepare(
    `DELETE FROM freellm_api_tokens WHERE user_id = ? AND label = ?`,
  )
    .bind(userId, TOKEN_LABEL)
    .run()
}

/** Decrypts and returns the member's stored key, or null when there is none. */
export async function getMemberFreellmKey(
  env: Bindings,
  userId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT freellm_key_hash FROM fitness_profiles WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ freellm_key_hash: string | null }>()
  const stored = row?.freellm_key_hash
  if (!stored) return null
  const passphrase = encryptionPassphrase(env)
  if (!passphrase) return null
  const decrypted = await decryptSecret(stored, passphrase)
  return decrypted && isValidFreellmKey(decrypted) ? decrypted : null
}

/**
 * Returns the member's freellm key, provisioning one on first use.
 * The plaintext is only ever held in memory for the request that needs it.
 */
export async function ensureMemberFreellmKey(
  env: Bindings,
  userId: string,
): Promise<string | null> {
  const existing = await getMemberFreellmKey(env, userId)
  if (existing) return existing

  const passphrase = encryptionPassphrase(env)
  if (!passphrase) return null

  const token = newFreellmToken()
  const tokenHash = await sha256Hex(token)
  const prefix = `${token.slice(0, 6)}…${token.slice(-4)}`
  const now = Date.now()

  // Replace any previous fitness-provisioned token for this member.
  await env.DB.prepare(
    `DELETE FROM freellm_api_tokens WHERE user_id = ? AND label = ?`,
  )
    .bind(userId, TOKEN_LABEL)
    .run()

  try {
    await env.DB.prepare(
      `INSERT INTO freellm_api_tokens
         (id, user_id, label, token_prefix, token_hash, connection_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), userId, TOKEN_LABEL, prefix, tokenHash, now)
      .run()
  } catch (err) {
    console.error('[freellm-key] token registration failed', err)
    return null
  }

  const encrypted = await encryptSecret(token, passphrase)
  await env.DB.prepare(
    `INSERT INTO fitness_profiles (user_id, created_at, updated_at, freellm_key_hash, freellm_key_updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       freellm_key_hash = excluded.freellm_key_hash,
       freellm_key_updated_at = excluded.freellm_key_updated_at,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, now, now, encrypted, now)
    .run()

  return token
}

/**
 * Returns the key to call freellm with. Fitness never uses a shared service
 * key: every member spends their own freellm credits through their own token.
 */
export async function resolveFreellmKey(
  env: Bindings,
  userId: string,
): Promise<string | null> {
  return ensureMemberFreellmKey(env, userId)
}
