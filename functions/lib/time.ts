// Timezone-aware day arithmetic.
//
// Logs store a local calendar date (YYYY-MM-DD). The date is derived from the
// user's IANA timezone so that "today" always matches their wall clock.

export const DEFAULT_TIMEZONE = 'UTC'

/** True when the value is a well-formed IANA timezone the runtime understands. */
export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 64) return false
  if (!/^[A-Za-z0-9_+\-/]+$/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** YYYY-MM-DD for `at` in the given timezone (falls back to UTC if invalid). */
export function localDate(timezone: string | null | undefined, at: Date = new Date()): string {
  const zone = timezone && isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const values: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value
  }
  return `${values.year}-${values.month}-${values.day}`
}

/**
 * The calendar day a quota bucket belongs to.
 *
 * Only a confirmed profile timezone is trusted. Hints from unconfirmed
 * profiles are ignored (UTC is used instead) so a caller cannot rotate
 * timezone hints to mint extra daily budgets.
 */
export function quotaDay(
  timezoneSource: string | null | undefined,
  timezone: string | null | undefined,
  at: Date = new Date(),
): string {
  return localDate(timezoneSource === 'user' ? timezone : null, at)
}

/** addDays('2026-10-19', -1) -> '2026-10-18' (calendar-safe, DST-agnostic). */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** Monday-start week containing `date`. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const offset = (weekday + 6) % 7
  return addDays(date, -offset)
}

export function weekEnd(date: string): string {
  return addDays(weekStart(date), 6)
}
