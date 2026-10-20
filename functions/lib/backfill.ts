// Repair after a user confirms or changes their timezone.
//
// Rows created before confirmation were dated with the UTC (or detected)
// calendar day. Re-derive each row's local date from its creation timestamp so
// the user's history, streak, and weekly totals line up with their wall clock.
//
// Re-dating can make several UTC days collapse into one local day, which would
// collide with the unique (user_id, recorded_at, type) index. Those rows are
// merged instead of silently ignored: numeric amounts are summed, quality takes
// the best value, and free text is joined so no entry is lost.

import { addDays, localDate } from './time'
import type { Bindings } from './types'

type LogRow = {
  id: string
  type: string
  recorded_at: string
  activity: string | null
  duration_min: number | null
  calories: number | null
  water_ml: number | null
  sets: number | null
  reps: number | null
  weight: number | null
  hours: number | null
  quality: number | null
  label: string | null
  value: string | null
  note: string | null
  scan_data: string | null
  created_at: number
}

type CheckinRow = { id: string; date: string; points: number; created_at: number }
type UsageRow = { date: string; count: number; updated_at: number }

async function runPairs(env: Bindings, pairs: D1PreparedStatement[][]): Promise<void> {
  let chunk: D1PreparedStatement[] = []
  for (const pair of pairs) {
    // A group's delete and update must stay in the same batch: the update only
    // succeeds once the colliding rows are gone.
    if (chunk.length > 0 && chunk.length + pair.length > 50) {
      await env.DB.batch(chunk)
      chunk = []
    }
    chunk.push(...pair)
  }
  if (chunk.length > 0) await env.DB.batch(chunk)
}

function runLengthEndingAt(dates: string[], index: number): number {
  let run = 1
  for (let cursor = index; cursor > 0; cursor -= 1) {
    if (addDays(dates[cursor - 1], 1) !== dates[cursor]) break
    run += 1
  }
  return run
}

async function rebuildStreak(env: Bindings, userId: string, timezone: string): Promise<void> {
  const rows = await env.DB.prepare(
    'SELECT DISTINCT date FROM daily_checkins WHERE user_id = ? ORDER BY date ASC',
  )
    .bind(userId)
    .all<{ date: string }>()
  const dates = rows.results.map((row) => row.date)
  if (dates.length === 0) return

  let longest = 0
  for (let index = 0; index < dates.length; index += 1) {
    longest = Math.max(longest, runLengthEndingAt(dates, index))
  }

  const today = localDate(timezone)
  const last = dates[dates.length - 1]
  const current = last === today || last === addDays(today, -1) ? runLengthEndingAt(dates, dates.length - 1) : 0

  const existing = await env.DB.prepare('SELECT longest_streak FROM daily_streaks WHERE user_id = ?')
    .bind(userId)
    .first<{ longest_streak: number }>()
  const preservedLongest = Math.max(longest, existing?.longest_streak ?? 0)
  const now = Date.now()

  await env.DB.prepare(
    `INSERT INTO daily_streaks (user_id, current_streak, longest_streak, last_checkin, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       last_checkin = excluded.last_checkin,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, current, preservedLongest, last, now)
    .run()
}

function sumField(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null
  return (left ?? 0) + (right ?? 0)
}

function maxField(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null
  return Math.max(left ?? 0, right ?? 0)
}

function joinText(values: Array<string | null>): string | null {
  const parts = Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  )
  return parts.length > 0 ? parts.join(' · ') : null
}

function mergeScanData(rows: LogRow[]): string | null {
  const scans: unknown[] = []
  const seen = new Set<string>()
  let found = false
  for (const row of rows) {
    if (!row.scan_data) continue
    try {
      const parsed = JSON.parse(row.scan_data) as { scans?: unknown }
      if (!Array.isArray(parsed.scans)) continue
      found = true
      for (const entry of parsed.scans) {
        const scanId =
          entry && typeof entry === 'object' && typeof (entry as { scan_id?: unknown }).scan_id === 'string'
            ? (entry as { scan_id: string }).scan_id
            : null
        if (scanId && seen.has(scanId)) continue
        if (scanId) seen.add(scanId)
        scans.push(entry)
      }
    } catch {
      // Corrupt scan payloads must not block the backfill; the row's calorie
      // total is still merged below.
    }
  }
  return found ? JSON.stringify({ source: 'scan', scans }) : null
}

function mergeLogRows(rows: LogRow[]): Omit<LogRow, 'id' | 'type' | 'recorded_at' | 'created_at'> {
  const ordered = [...rows].sort((a, b) => a.created_at - b.created_at)
  const merged: Omit<LogRow, 'id' | 'type' | 'recorded_at' | 'created_at'> = {
    activity: null,
    duration_min: null,
    calories: null,
    water_ml: null,
    sets: null,
    reps: null,
    weight: null,
    hours: null,
    quality: null,
    label: null,
    value: null,
    note: null,
    scan_data: mergeScanData(ordered),
  }

  for (const row of ordered) {
    merged.activity = joinText([merged.activity, row.activity])
    merged.duration_min = sumField(merged.duration_min, row.duration_min)
    merged.calories = sumField(merged.calories, row.calories)
    merged.water_ml = sumField(merged.water_ml, row.water_ml)
    merged.sets = sumField(merged.sets, row.sets)
    merged.reps = sumField(merged.reps, row.reps)
    merged.hours = sumField(merged.hours, row.hours)
    merged.quality = maxField(merged.quality, row.quality)
    merged.label = joinText([merged.label, row.label])
    merged.value = joinText([merged.value, row.value])
    merged.note = joinText([merged.note, row.note])
    if (row.weight !== null) merged.weight = row.weight
  }

  return merged
}

function pickCanonical(rows: LogRow[], target: string): LogRow {
  const alreadyLocal = rows.find((row) => row.recorded_at === target)
  if (alreadyLocal) return alreadyLocal
  return [...rows].sort((a, b) => a.created_at - b.created_at)[0]
}

async function reDateLogs(
  env: Bindings,
  userId: string,
  timezone: string,
  logs: LogRow[],
): Promise<number> {
  const groups = new Map<string, LogRow[]>()
  for (const row of logs) {
    const target = localDate(timezone, new Date(row.created_at))
    const key = `${target}|${row.type}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const pairs: D1PreparedStatement[][] = []
  let changed = 0
  const now = Date.now()

  for (const [key, rows] of groups) {
    const target = key.slice(0, key.indexOf('|'))
    const stale = rows.filter((row) => row.recorded_at !== target)
    if (stale.length === 0) continue
    changed += stale.length

    const canonical = pickCanonical(rows, target)
    const merged = mergeLogRows(rows)
    const others = rows.filter((row) => row.id !== canonical.id)
    const statements: D1PreparedStatement[] = []
    if (others.length > 0) {
      statements.push(
        env.DB.prepare(
          `DELETE FROM fitness_logs WHERE id IN (${others.map(() => '?').join(', ')})`,
        ).bind(...others.map((row) => row.id)),
      )
    }
    statements.push(
      env.DB.prepare(
        `UPDATE fitness_logs SET
           recorded_at = ?, activity = ?, duration_min = ?, calories = ?, water_ml = ?,
           sets = ?, reps = ?, weight = ?, hours = ?, quality = ?, label = ?, value = ?,
           note = ?, scan_data = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(
        target,
        merged.activity,
        merged.duration_min,
        merged.calories,
        merged.water_ml,
        merged.sets,
        merged.reps,
        merged.weight,
        merged.hours,
        merged.quality,
        merged.label,
        merged.value,
        merged.note,
        merged.scan_data,
        now,
        canonical.id,
      ),
    )
    pairs.push(statements)
  }

  await runPairs(env, pairs)
  return changed
}

async function reDateCheckins(
  env: Bindings,
  userId: string,
  timezone: string,
  checkins: CheckinRow[],
): Promise<number> {
  const groups = new Map<string, CheckinRow[]>()
  for (const row of checkins) {
    const target = localDate(timezone, new Date(row.created_at))
    const group = groups.get(target)
    if (group) group.push(row)
    else groups.set(target, [row])
  }

  const pairs: D1PreparedStatement[][] = []
  let changed = 0

  for (const [target, rows] of groups) {
    const stale = rows.filter((row) => row.date !== target)
    if (stale.length === 0) continue
    changed += stale.length

    const canonical =
      rows.find((row) => row.date === target) ??
      [...rows].sort((a, b) => a.created_at - b.created_at)[0]
    const points = rows.reduce((total, row) => total + row.points, 0)
    const others = rows.filter((row) => row.id !== canonical.id)
    const statements: D1PreparedStatement[] = []
    if (others.length > 0) {
      statements.push(
        env.DB.prepare(
          `DELETE FROM daily_checkins WHERE id IN (${others.map(() => '?').join(', ')})`,
        ).bind(...others.map((row) => row.id)),
      )
    }
    statements.push(
      env.DB.prepare('UPDATE daily_checkins SET date = ?, points = ? WHERE id = ?').bind(
        target,
        points,
        canonical.id,
      ),
    )
    pairs.push(statements)
  }

  await runPairs(env, pairs)
  return changed
}

async function reDateScanUsage(
  env: Bindings,
  userId: string,
  timezone: string,
  usage: UsageRow[],
): Promise<void> {
  if (usage.length === 0) return
  const targetFor = (row: UsageRow) => localDate(timezone, new Date(row.updated_at))
  if (usage.every((row) => row.date === targetFor(row))) return

  // The quota table has no per-scan timestamps, so its row timestamp is the
  // best available anchor. Conservative merge: counts from every source day
  // are credited to the local day, never dropped (dropping could hand the user
  // a fresh daily allowance after a timezone change).
  const merged = new Map<string, number>()
  for (const row of usage) {
    const target = targetFor(row)
    merged.set(target, (merged.get(target) ?? 0) + row.count)
  }

  const now = Date.now()
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM fitness_scan_usage WHERE user_id = ?').bind(userId),
  ]
  for (const [date, count] of merged) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO fitness_scan_usage (user_id, date, count, updated_at) VALUES (?, ?, ?, ?)',
      ).bind(userId, date, count, now),
    )
  }
  await env.DB.batch(statements)
}

/** Re-dates logs, check-ins, and quota rows, then rebuilds derived streaks. */
export async function backfillLocalDates(
  env: Bindings,
  userId: string,
  timezone: string,
): Promise<number> {
  const [logs, checkins, usage] = await Promise.all([
    env.DB.prepare(
      `SELECT id, type, recorded_at, activity, duration_min, calories, water_ml, sets,
              reps, weight, hours, quality, label, value, note, scan_data, created_at
         FROM fitness_logs WHERE user_id = ?`,
    )
      .bind(userId)
      .all<LogRow>(),
    env.DB.prepare('SELECT id, date, points, created_at FROM daily_checkins WHERE user_id = ?')
      .bind(userId)
      .all<CheckinRow>(),
    env.DB.prepare('SELECT date, count, updated_at FROM fitness_scan_usage WHERE user_id = ?')
      .bind(userId)
      .all<UsageRow>(),
  ])

  const logsChanged = await reDateLogs(env, userId, timezone, logs.results)
  await reDateCheckins(env, userId, timezone, checkins.results)
  await reDateScanUsage(env, userId, timezone, usage.results)
  await rebuildStreak(env, userId, timezone)

  return logsChanged
}
