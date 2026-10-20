import type { D1Database } from '@cloudflare/workers-types'

/** Returns the first matching pattern for an email, or null when allowed. */
export function emailBlockedByPatterns(email: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern).test(email)) return pattern
    } catch {
      // A corrupt stored row must never lock everyone out — skip it.
    }
  }
  return null
}

/** Loads all block patterns and tests the email. Null = allowed. */
export async function isEmailBlocked(db: D1Database, email: string): Promise<string | null> {
  const rows = await db
    .prepare('SELECT pattern FROM freellm_email_blocks')
    .all<{ pattern: string }>()
    .catch(() => null)
  // Table missing (migration not yet applied) = fail open, never lock out.
  if (!rows) return null
  return emailBlockedByPatterns(email, rows.results.map((r) => r.pattern))
}