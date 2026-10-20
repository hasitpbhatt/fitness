export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : delta.toString()
}

export function formatCalories(calories: number | null): string {
  if (calories == null) return '—'
  return `${calories.toLocaleString('en-US')} cal`
}

export function formatWater(ml: number | null): string {
  if (ml == null) return '—'
  const liters = ml / 1000
  if (ml >= 1000) return `${liters.toFixed(1)} L`
  return `${ml.toLocaleString('en-US')} ml`
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })
}

export function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}