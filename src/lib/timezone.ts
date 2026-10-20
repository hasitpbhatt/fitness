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
