// Client-side timezone detection + display helpers.

const COMMON_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
]

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** YYYY-MM-DD for `at` in the given timezone. */
export function localDate(timezone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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

/** addDays('2026-10-19', -1) -> '2026-10-18' (calendar-safe, DST-agnostic). */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/** IANA zones for the picker: common ones first, then everything the browser knows. */
export function timezoneOptions(): string[] {
  let supported: string[] = []
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    supported = intl.supportedValuesOf?.('timeZone') ?? []
  } catch {
    supported = []
  }
  return Array.from(new Set([...COMMON_ZONES, ...supported]))
}

/** "Asia/Kolkata (GMT+5:30)" when the runtime can format the offset. */
export function formatTimezoneLabel(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value
    return offset ? `${timezone} (${offset})` : timezone
  } catch {
    return timezone
  }
}
