// Fitness API routes

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { resolveTimezone } from '../lib/profile'
import { updateStreaks } from '../lib/streaks'
import { localDate, weekEnd, weekStart } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const VALID_TYPES: string[] = ['workout', 'nutrition', 'sleep', 'water', 'custom']

// Helper to get session from cookie
async function getSession(kv: KVNamespace, cookieHeader: string | null | undefined) {
  const match = cookieHeader?.match(/fitness_session=([^;]+)/)
  if (!match) return null
  const raw = await kv.get(`session:${match[1]}`)
  if (!raw) return null
  try { return JSON.parse(raw) as { userId: string } } catch { return null }
}

// Get today's log for user
app.get('/api/fitness/log/today', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const timezone = await resolveTimezone(c.env, session.userId, c.req.query('tz'))
  const today = localDate(timezone)
  const logs = await c.env.DB.prepare(
    'SELECT * FROM fitness_logs WHERE user_id = ? AND recorded_at = ? ORDER BY created_at DESC'
  ).bind(session.userId, today).all()
  return c.json({ logs: logs.results, date: today, timezone: timezone ?? 'UTC' })
})

// Create a new log entry
app.post('/api/fitness/log', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json()

  const {
    type, activity = null, duration_min = null, calories = null, water_ml = null, sets = null, reps = null, weight = null,
    hours = null, quality = null, label = null, value = null, note = null
  } = body

  if (!VALID_TYPES.includes(type)) {
    return c.json({ error: 'invalid_type', message: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400)
  }

  const timezone = await resolveTimezone(
    c.env,
    session.userId,
    typeof body.timezone === 'string' ? body.timezone : null,
  )
  const today = localDate(timezone)
  const id = newId()
  const now = Date.now()

  // The unique (user_id, recorded_at, type) index makes this the single
  // source of truth: concurrent submissions race on the insert, not on a
  // read-then-write check that both requests can pass.
  const inserted = await c.env.DB.prepare(`
    INSERT OR IGNORE INTO fitness_logs (
      id, user_id, type, recorded_at, activity, duration_min, calories, water_ml,
      sets, reps, weight, hours, quality, label, value, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, session.userId, type, today, activity, duration_min, calories, water_ml,
    sets, reps, weight, hours, quality, label, value, note, now, now
  ).run()

  if ((inserted.meta.changes ?? 0) === 0) {
    return c.json({ error: 'already_logged_today', message: `You've already logged ${type} today` }, 409)
  }

  // Streak bookkeeping is secondary: the log is already committed, so never
  // turn a streak failure into a 500 that tempts the user to retry into a 409.
  await updateStreaks(c.env, session.userId, timezone).catch((err) => {
    console.error('[fitness] updateStreaks failed', err)
  })

  const log = await c.env.DB.prepare('SELECT * FROM fitness_logs WHERE id = ?').bind(id).first()
  return c.json({ log: log, date: today })
})

// Get all logs for a date range
app.get('/api/fitness/logs', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const startDate = c.req.query('start')
  const endDate = c.req.query('end')
  
  let query = 'SELECT * FROM fitness_logs WHERE user_id = ?'
  const params: any[] = [session.userId]
  
  if (startDate) {
    query += ' AND recorded_at >= ?'
    params.push(startDate)
  }
  if (endDate) {
    query += ' AND recorded_at <= ?'
    params.push(endDate)
  }
  
  query += ' ORDER BY recorded_at DESC, created_at DESC'
  
  const logs = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ logs: logs.results })
})

// Get user goals
app.get('/api/fitness/goals', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const goals = await c.env.DB.prepare('SELECT * FROM fitness_goals WHERE user_id = ?').bind(session.userId).all()
  return c.json({ goals: goals.results })
})

// Set or update a goal
app.post('/api/fitness/goals', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const { type, target, period } = body
  const VALID_PERIODS = ['day', 'week', 'month']
  if (!VALID_TYPES.includes(type as string)) {
    return c.json({ error: 'invalid_type', message: `type must be one of: ${VALID_TYPES.join(', ')}` }, 400)
  }
  if (typeof target !== 'number' || !Number.isFinite(target) || target < 0) {
    return c.json({ error: 'invalid_target', message: 'target must be a non-negative number.' }, 400)
  }
  if (period != null && !VALID_PERIODS.includes(period as string)) {
    return c.json({ error: 'invalid_period', message: `period must be one of: ${VALID_PERIODS.join(', ')}` }, 400)
  }

  const goalType = type as string
  const goalPeriod = (period as string | undefined) || 'day'
  const requestedId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null
  const goalId = requestedId ?? newId()
  const now = Date.now()

  if (requestedId) {
    // Updates are owner-scoped. Never let a caller-supplied id replace another
    // user's row through the primary key conflict.
    const result = await c.env.DB.prepare(
      `UPDATE fitness_goals
       SET type = ?, target = ?, period = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(goalType, Math.round(target), goalPeriod, now, goalId, session.userId).run()
    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ error: 'not_found', message: 'That goal does not exist.' }, 404)
    }
  } else {
    await c.env.DB.prepare(
      `INSERT INTO fitness_goals (id, user_id, type, target, current, period, updated_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(goalId, session.userId, goalType, Math.round(target), goalPeriod, now, now).run()
  }

  const goal = await c.env.DB.prepare(
    'SELECT * FROM fitness_goals WHERE id = ? AND user_id = ?',
  ).bind(goalId, session.userId).first()
  return c.json({ goal })
})

// Get user streaks
app.get('/api/fitness/streaks', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const streaks = await c.env.DB.prepare('SELECT * FROM daily_streaks WHERE user_id = ?').bind(session.userId).first()
  return c.json({ streaks: streaks || null })
})

// Get leaderboard (weekly totals)
app.get('/api/fitness/leaderboard', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  const timezone = await resolveTimezone(c.env, session?.userId ?? null, c.req.query('tz'))
  const today = localDate(timezone)
  const start = c.req.query('week_start') || weekStart(today)
  const end = c.req.query('week_end') || weekEnd(today)
  
  const rows = await c.env.DB.prepare(`
    SELECT 
      u.id, u.username, u.display_name, u.avatar_url,
      SUM(CASE WHEN f.type = 'workout' THEN f.duration_min ELSE 0 END) as workout_minutes,
      SUM(CASE WHEN f.type = 'water' THEN f.water_ml ELSE 0 END) as water_ml,
      SUM(CASE WHEN f.type = 'nutrition' THEN f.calories ELSE 0 END) as calories
    FROM freellm_users u
    LEFT JOIN fitness_logs f ON u.id = f.user_id AND f.recorded_at BETWEEN ? AND ?
    WHERE u.email_verified = 1
    GROUP BY u.id, u.username, u.display_name, u.avatar_url
    ORDER BY workout_minutes DESC, water_ml DESC
    LIMIT 50
  `).bind(start, end).all()
  
  return c.json({ leaderboard: rows.results, weekStart: start, weekEnd: end, timezone: timezone ?? 'UTC' })
})

// Get user achievements/badges
app.get('/api/fitness/badges', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const badges = await c.env.DB.prepare(`
    SELECT ub.badge_code, ub.awarded_at, b.name, b.description, b.icon, b.rarity
    FROM user_badges ub
    JOIN fitness_badges b ON ub.badge_code = b.code
    WHERE ub.user_id = ?
    ORDER BY ub.awarded_at DESC
  `).bind(session.userId).all()
  return c.json({ badges: badges.results })
})

export default app