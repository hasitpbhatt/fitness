// Admin-only baseline analytics: activity, retention, AI funnel, reliability,
// and provisioned-access counts. Events never contain member-authored content.

import { Hono } from 'hono'
import { isAdmin } from '../lib/admin'
import { getSession } from '../lib/session'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const DEFAULT_DAYS = 30
const MAX_DAYS = 90
const MAX_EVENTS = 10_000

type CountRow = { count: number }
type ActivityRow = { date: string; logs: number; active: number }
type MemberWindows = { dau: number; wau: number; mau: number }
type EventRow = {
  name: string
  surface: string | null
  status: number | null
  error_code: string | null
  latency_ms: number | null
}
type GrantRow = { tier: string; status: string; count: number }

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function isAiCall(event: EventRow): boolean {
  return (
    event.status !== null && event.status !== 400 && event.status !== 401 && event.status !== 403
  )
}

function summarize(events: EventRow[], includeSurface: boolean) {
  const calls = events.filter(isAiCall)
  const successes = calls.filter((event) => (event.status ?? 0) >= 200 && (event.status ?? 0) < 300)
  const failures = calls.length - successes.length
  const latencies = calls
    .map((event) => event.latency_ms)
    .filter((value): value is number => typeof value === 'number' && value >= 0)

  const errors: Record<string, number> = {}
  for (const event of calls) {
    if ((event.status ?? 0) >= 200 && (event.status ?? 0) < 300) continue
    const key = `${event.status ?? 0}:${event.error_code ?? 'unknown'}`
    errors[key] = (errors[key] ?? 0) + 1
  }

  const surfaces: Record<string, { calls: number; successes: number; p95_ms: number | null }> = {}
  if (includeSurface) {
    for (const event of calls) {
      const key = event.surface ?? 'unknown'
      const bucket = surfaces[key] ?? { calls: 0, successes: 0, p95_ms: null }
      bucket.calls += 1
      if ((event.status ?? 0) >= 200 && (event.status ?? 0) < 300) bucket.successes += 1
      surfaces[key] = bucket
    }
    for (const [key, bucket] of Object.entries(surfaces)) {
      const values = calls
        .filter((event) => (event.surface ?? 'unknown') === key)
        .map((event) => event.latency_ms)
        .filter((value): value is number => typeof value === 'number' && value >= 0)
      bucket.p95_ms = percentile(values, 95)
    }
  }

  return {
    calls: calls.length,
    successes: successes.length,
    failures,
    success_rate: calls.length > 0 ? Math.round((successes.length / calls.length) * 1000) / 10 : null,
    quota_blocks: calls.filter((event) => event.status === 429).length,
    latency_ms: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    errors,
    by_surface: includeSurface ? surfaces : undefined,
  }
}

app.get('/api/admin/analytics', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  if (!(await isAdmin(c.env, session.userId))) return c.json({ error: 'forbidden' }, 403)

  const rawDays = c.req.query('days') ?? String(DEFAULT_DAYS)
  const days = Number(rawDays)
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return c.json(
      { error: 'invalid_days', message: `days must be an integer from 1 to ${MAX_DAYS}.` },
      400,
    )
  }

  const now = Date.now()
  const sinceMs = now - days * 24 * 60 * 60 * 1000
  const today = localDate(null)
  const sinceDate = addDays(today, -(days - 1))
  const weekStart = addDays(today, -6)
  const monthStart = addDays(today, -29)

  const totalMembers = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM fitness_profiles',
  ).first<CountRow>()
  const newMembers = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM fitness_profiles WHERE created_at >= ?',
  )
    .bind(sinceMs)
    .first<CountRow>()
  const onboarded = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM fitness_profiles WHERE onboarding_complete = 1',
  ).first<CountRow>()
  const active = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT user_id) AS count FROM fitness_logs
     WHERE recorded_at >= ? AND activity IS NOT 'Welcome to fitness.hasit.in'`,
  )
    .bind(sinceDate)
    .first<CountRow>()
  const returning = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM (
       SELECT user_id FROM fitness_logs
       WHERE recorded_at >= ? AND activity IS NOT 'Welcome to fitness.hasit.in'
       GROUP BY user_id HAVING COUNT(DISTINCT recorded_at) >= 2
     )`,
  )
    .bind(sinceDate)
    .first<CountRow>()
  const windows = await c.env.DB.prepare(
    `SELECT
       COUNT(DISTINCT CASE WHEN recorded_at = ? THEN user_id END) AS dau,
       COUNT(DISTINCT CASE WHEN recorded_at >= ? THEN user_id END) AS wau,
       COUNT(DISTINCT CASE WHEN recorded_at >= ? THEN user_id END) AS mau
     FROM fitness_logs
     WHERE activity IS NOT 'Welcome to fitness.hasit.in'`,
  )
    .bind(today, weekStart, monthStart)
    .first<MemberWindows>()
  const activityRows = await c.env.DB.prepare(
    `SELECT recorded_at AS date, COUNT(*) AS logs, COUNT(DISTINCT user_id) AS active
     FROM fitness_logs
     WHERE recorded_at >= ? AND activity IS NOT 'Welcome to fitness.hasit.in'
     GROUP BY recorded_at ORDER BY recorded_at ASC`,
  )
    .bind(sinceDate)
    .all<ActivityRow>()

  const byDate = new Map(activityRows.results.map((row) => [row.date, row]))
  const activitySeries = Array.from({ length: days }, (_, index) => {
    const date = addDays(sinceDate, index)
    const row = byDate.get(date)
    return { date, logs: row?.logs ?? 0, active: row?.active ?? 0 }
  })

  const events = await c.env.DB.prepare(
    `SELECT name, surface, status, error_code, latency_ms
     FROM fitness_events WHERE created_at >= ?
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(sinceMs, MAX_EVENTS)
    .all<EventRow>()

  const scanEvents = events.results.filter((event) => event.name === 'scan_estimate')
  const estimateEvents = scanEvents.filter((event) => event.surface !== 'suggest')
  const attemptEvents = estimateEvents.filter(isAiCall)
  const estimateSuccesses = attemptEvents.filter(
    (event) => (event.status ?? 0) >= 200 && (event.status ?? 0) < 300,
  )
  const mealLogged = events.results.filter(
    (event) =>
      event.name === 'scan_logged' &&
      (event.status ?? 0) >= 200 &&
      (event.status ?? 0) < 300,
  )
  const coachEvents = events.results.filter((event) => event.name === 'coach_reply')
  const grants = await c.env.DB.prepare(
    `SELECT tier, status, COUNT(*) AS count
     FROM fitness_entitlements GROUP BY tier, status ORDER BY count DESC`,
  ).all<GrantRow>()

  return c.json({
    window: { days, start: sinceDate, end: today },
    members: {
      total: totalMembers?.count ?? 0,
      new: newMembers?.count ?? 0,
      onboarded: onboarded?.count ?? 0,
      onboarded_pct:
        (totalMembers?.count ?? 0) > 0
          ? Math.round(((onboarded?.count ?? 0) / (totalMembers?.count ?? 1)) * 1000) / 10
          : null,
    },
    activity: {
      dau: windows?.dau ?? 0,
      wau: windows?.wau ?? 0,
      mau: windows?.mau ?? 0,
      active: active?.count ?? 0,
      returning: returning?.count ?? 0,
      series: activitySeries,
    },
    funnel: {
      estimate_attempts: attemptEvents.length,
      estimate_successes: estimateSuccesses.length,
      meals_logged: mealLogged.length,
      logged_per_success:
        estimateSuccesses.length > 0
          ? Math.round((mealLogged.length / estimateSuccesses.length) * 1000) / 10
          : null,
    },
    reliability: {
      sampled: events.results.length >= MAX_EVENTS,
      sample_limit: MAX_EVENTS,
      scan: summarize(scanEvents, true),
      coach: summarize(coachEvents, false),
    },
    access: { grants: grants.results },
    server_time: now,
  })
})

export default app
