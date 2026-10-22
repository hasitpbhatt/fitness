// Fitness API routes

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { resolveTimezone } from '../lib/profile'
import { updateStreaks } from '../lib/streaks'
import { addDays, localDate, weekEnd, weekStart } from '../lib/time'
import {
  calculateTargets,
  type ActivityLevel,
  type BodyProfile,
  type GoalType,
  type Sex,
} from '../lib/targets'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const VALID_TYPES: string[] = ['workout', 'nutrition', 'sleep', 'water', 'custom']
const CORRECTION_WINDOW_DAYS = 7
const TARGET_LIMITS = {
  calorie_target: 20_000,
  protein_target_g: 1_000,
  carbs_target_g: 1_000,
  fat_target_g: 1_000,
} as const
const TARGET_FIELDS = Object.keys(TARGET_LIMITS) as (keyof typeof TARGET_LIMITS)[]

const GOAL_METRICS: Record<string, string> = {
  workout: 'duration_min',
  nutrition: 'calories',
  water: 'water_ml',
  sleep: 'COALESCE(hours, duration_min / 60.0)',
}
const GOAL_UNITS: Record<string, string> = {
  workout: 'min',
  nutrition: 'kcal',
  water: 'ml',
  sleep: 'h',
  custom: '',
}

function goalPeriodStart(period: string, today: string): string {
  if (period === 'week') return weekStart(today)
  if (period === 'month') return `${today.slice(0, 7)}-01`
  return today
}

async function addGoalProgress(
  env: Bindings,
  userId: string,
  goals: Record<string, unknown>[],
  today: string,
) {
  return Promise.all(
    goals.map(async (goal) => {
      const type = String(goal.type ?? '')
      const period = String(goal.period ?? 'day')
      const periodStart = goalPeriodStart(period, today)
      const metric = GOAL_METRICS[type]
      let progress = Number(goal.current ?? 0)
      if (metric) {
        const row = await env.DB.prepare(
          `SELECT COALESCE(SUM(${metric}), 0) AS progress
           FROM fitness_logs
           WHERE user_id = ? AND type = ? AND recorded_at >= ? AND recorded_at <= ?`,
        )
          .bind(userId, type, periodStart, today)
          .first<{ progress: number }>()
        progress = Number(row?.progress ?? 0)
      }
      return {
        ...goal,
        progress: Math.round(progress * 10) / 10,
        period_start: periodStart,
        unit: GOAL_UNITS[type] ?? '',
      }
    }),
  )
}

function correctionDate(value: unknown, today: string): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (value > today) return null
  if (value < addDays(today, -CORRECTION_WINDOW_DAYS)) return null
  return value
}

function targetValues(row: Record<string, unknown> | null) {
  return {
    calorie_target: (row?.calorie_target as number | null | undefined) ?? null,
    protein_target_g: (row?.protein_target_g as number | null | undefined) ?? null,
    carbs_target_g: (row?.carbs_target_g as number | null | undefined) ?? null,
    fat_target_g: (row?.fat_target_g as number | null | undefined) ?? null,
    fiber_target_g: (row?.fiber_target_g as number | null | undefined) ?? null,
    water_target_ml: (row?.water_target_ml as number | null | undefined) ?? null,
    exercise_target_min: (row?.exercise_target_min as number | null | undefined) ?? null,
  }
}

function readTargetField(value: unknown, limit: number): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
    return undefined
  }
  return value
}

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
  const [logs, profile] = await Promise.all([
    c.env.DB.prepare(
      'SELECT * FROM fitness_logs WHERE user_id = ? AND recorded_at = ? ORDER BY created_at DESC'
    ).bind(session.userId, today).all(),
    c.env.DB.prepare(
      'SELECT calorie_target, protein_target_g, carbs_target_g, fat_target_g, fiber_target_g, water_target_ml, exercise_target_min FROM fitness_profiles WHERE user_id = ?',
    ).bind(session.userId).first(),
  ])
  return c.json({
    logs: logs.results,
    date: today,
    timezone: timezone ?? 'UTC',
    targets: targetValues(profile),
  })
})

// Create a new log entry
app.post('/api/fitness/log', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json()

  const {
    type, activity = null, duration_min = null, calories = null, water_ml = null, sets = null, reps = null, weight = null,
    hours = null, quality = null, label = null, value = null, note = null,
    protein_g = null, carbs_g = null, fat_g = null
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
  let recordedAt = today
  if (body.date != null) {
    const requested = correctionDate(body.date, today)
    if (!requested) {
      return c.json(
        {
          error: 'invalid_date',
          message: `date must be today or within the last ${CORRECTION_WINDOW_DAYS} days (YYYY-MM-DD).`,
        },
        400,
      )
    }
    recordedAt = requested
  }

  const macros = { protein_g, carbs_g, fat_g }
  for (const [field, value] of Object.entries(macros)) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000)) {
      return c.json({ error: 'invalid_macros', message: `${field} must be 0-1000g.` }, 400)
    }
  }

  const id = newId()
  const now = Date.now()

  // The unique (user_id, recorded_at, type) index makes this the single
  // source of truth: concurrent submissions race on the insert, not on a
  // read-then-write check that both requests can pass.
  const inserted = await c.env.DB.prepare(`
    INSERT OR IGNORE INTO fitness_logs (
      id, user_id, type, recorded_at, activity, duration_min, calories, water_ml,
      sets, reps, weight, hours, quality, label, value, note, protein_g, carbs_g, fat_g,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, session.userId, type, recordedAt, activity, duration_min, calories, water_ml,
    sets, reps, weight, hours, quality, label, value, note, protein_g, carbs_g, fat_g, now, now
  ).run()

  if ((inserted.meta.changes ?? 0) === 0) {
    return c.json({ error: 'already_logged_today', message: `You've already logged ${type} for that day` }, 409)
  }

  // Streak bookkeeping is secondary: the log is already committed, so never
  // turn a streak failure into a 500 that tempts the user to retry into a 409.
  await updateStreaks(c.env, session.userId, timezone).catch((err) => {
    console.error('[fitness] updateStreaks failed', err)
  })

  const log = await c.env.DB.prepare('SELECT * FROM fitness_logs WHERE id = ?').bind(id).first()
  return c.json({ log: log, date: recordedAt })
})

// Edit one of the caller's logs. Date moves are limited to the correction window.
app.patch('/api/fitness/log/:id', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const id = c.req.param('id')
  const existing = await c.env.DB.prepare(
    'SELECT id, type FROM fitness_logs WHERE id = ? AND user_id = ?',
  )
    .bind(id, session.userId)
    .first<{ id: string; type: string }>()
  if (!existing) return c.json({ error: 'not_found', message: 'That log does not exist.' }, 404)

  const updates: Record<string, string | number | null> = {}
  const numericLimits: Record<string, number> = {
    duration_min: 1_440,
    calories: 20_000,
    water_ml: 20_000,
    sets: 1_000,
    reps: 10_000,
    weight: 1_000,
    hours: 24,
    quality: 5,
    protein_g: 1_000,
    carbs_g: 1_000,
    fat_g: 1_000,
  }
  for (const [field, limit] of Object.entries(numericLimits)) {
    if (!(field in body)) continue
    const value = body[field]
    if (value === null) {
      updates[field] = null
      continue
    }
    const min = field === 'quality' ? 1 : 0
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > limit ||
      (field === 'quality' && !Number.isInteger(value))
    ) {
      return c.json({ error: 'invalid_field', message: `${field} is out of range.` }, 400)
    }
    updates[field] = value
  }

  const textLimits: Record<string, number> = {
    activity: 200,
    label: 100,
    value: 200,
    note: 2_000,
  }
  for (const [field, limit] of Object.entries(textLimits)) {
    if (!(field in body)) continue
    const value = body[field]
    if (value === null) {
      updates[field] = null
      continue
    }
    if (typeof value !== 'string' || value.length > limit) {
      return c.json({ error: 'invalid_field', message: `${field} is invalid.` }, 400)
    }
    updates[field] = value.trim() || null
  }

  if ('recorded_at' in body) {
    const timezone = await resolveTimezone(c.env, session.userId, null)
    const today = localDate(timezone)
    const date = correctionDate(body.recorded_at, today)
    if (!date) {
      return c.json(
        {
          error: 'invalid_date',
          message: `recorded_at must be today or within the last ${CORRECTION_WINDOW_DAYS} days.`,
        },
        400,
      )
    }
    updates.recorded_at = date
  }

  const fields = Object.keys(updates)
  if (fields.length === 0) {
    return c.json({ error: 'no_changes', message: 'Nothing to update.' }, 400)
  }

  const now = Date.now()
  try {
    const result = await c.env.DB.prepare(
      `UPDATE fitness_logs SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
      .bind(...fields.map((field) => updates[field]), now, id, session.userId)
      .run()
    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ error: 'not_found', message: 'That log does not exist.' }, 404)
    }
    if (typeof updates.recorded_at === 'string') {
      await c.env.DB.prepare(
        'UPDATE fitness_scan_ledger SET recorded_at = ? WHERE user_id = ? AND log_id = ?',
      )
        .bind(updates.recorded_at, session.userId, id)
        .run()
    }
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err))) {
      return c.json(
        {
          error: 'already_logged_today',
          message: `You already have a ${existing.type} log on that day.`,
        },
        409,
      )
    }
    console.error('[fitness] log update failed', err)
    return c.json({ error: 'update_failed', message: "Couldn't save that change." }, 500)
  }

  const log = await c.env.DB.prepare(
    'SELECT * FROM fitness_logs WHERE id = ? AND user_id = ?',
  )
    .bind(id, session.userId)
    .first()
  return c.json({ log })
})

// Remove one of the caller's logs and any scan-ledger reservation for it.
app.delete('/api/fitness/log/:id', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const id = c.req.param('id')
  const result = await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM fitness_logs WHERE id = ? AND user_id = ?').bind(id, session.userId),
    c.env.DB.prepare('DELETE FROM fitness_scan_ledger WHERE user_id = ? AND log_id = ?').bind(
      session.userId,
      id,
    ),
  ])
  if ((result[0]?.meta.changes ?? 0) === 0) {
    return c.json({ error: 'not_found', message: 'That log does not exist.' }, 404)
  }
  return c.json({ ok: true, deleted: true })
})

app.get('/api/fitness/targets', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const row = await c.env.DB.prepare(
    'SELECT calorie_target, protein_target_g, carbs_target_g, fat_target_g, fiber_target_g, water_target_ml, exercise_target_min FROM fitness_profiles WHERE user_id = ?',
  )
    .bind(session.userId)
    .first()
  return c.json({ targets: targetValues(row) })
})

app.put('/api/fitness/targets', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const targets: Record<string, number | null> = {}
  for (const field of TARGET_FIELDS) {
    const value = readTargetField(body[field], TARGET_LIMITS[field])
    if (value === undefined) {
      return c.json({ error: 'invalid_target', message: `${field} is out of range.` }, 400)
    }
    targets[field] = value === null ? null : field === 'calorie_target' ? Math.round(value) : value
  }

  const now = Date.now()
  await c.env.DB.prepare(
    `INSERT INTO fitness_profiles (
       user_id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calorie_target = excluded.calorie_target,
       protein_target_g = excluded.protein_target_g,
       carbs_target_g = excluded.carbs_target_g,
       fat_target_g = excluded.fat_target_g,
       updated_at = excluded.updated_at`,
  )
    .bind(
      session.userId,
      targets.calorie_target,
      targets.protein_target_g,
      targets.carbs_target_g,
      targets.fat_target_g,
      now,
      now,
    )
    .run()

  // Keep the "Eat well" focus goal in step with the calorie target. The two
  // are the same number, so they must never disagree on the dashboard.
  if (targets.calorie_target != null) {
    await c.env.DB.prepare(
      `UPDATE fitness_goals
       SET target = ?, updated_at = ?
       WHERE user_id = ? AND type = 'nutrition' AND period = 'day'`,
    )
      .bind(targets.calorie_target, now, session.userId)
      .run()
  }

  return c.json({ targets })
})

const GOAL_TYPES: GoalType[] = ['lose', 'maintain', 'gain']
const SEXES: Sex[] = ['female', 'male']
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'athlete']

function readBodyProfile(raw: unknown): BodyProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as Record<string, unknown>
  const goalType = body.goal_type
  const sex = body.sex
  const activity = body.activity_level
  const birthYear = Number(body.birth_year)
  const height = Number(body.height_cm)
  const weight = Number(body.weight_kg)
  if (!GOAL_TYPES.includes(goalType as GoalType)) return null
  if (!SEXES.includes(sex as Sex)) return null
  if (!ACTIVITY_LEVELS.includes(activity as ActivityLevel)) return null
  if (!Number.isFinite(birthYear) || !Number.isFinite(height) || !Number.isFinite(weight)) return null
  return {
    goal_type: goalType as GoalType,
    sex: sex as Sex,
    birth_year: Math.round(birthYear),
    height_cm: height,
    weight_kg: weight,
    activity_level: activity as ActivityLevel,
  }
}

/**
 * Work out the daily targets from a goal and a body profile. This does not
 * write anything - the app shows the member the numbers before they commit.
 */
app.post('/api/fitness/targets/calculate', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ profile?: unknown }>().catch(() => null)
  const profile = readBodyProfile(body?.profile)
  if (!profile) {
    return c.json({ error: 'invalid_profile', message: 'Send a goal, sex, birth year, height, weight and activity level.' }, 400)
  }

  const targets = calculateTargets(profile)
  if (!targets) {
    return c.json({ error: 'invalid_profile', message: 'Those numbers are outside the range we can work with.' }, 400)
  }
  return c.json({ targets })
})

/**
 * Save the body profile and the targets derived from it. The member can
 * override any target afterwards.
 */
app.put('/api/fitness/body-profile', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie'))
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ profile?: unknown }>().catch(() => null)
  const profile = readBodyProfile(body?.profile)
  if (!profile) {
    return c.json({ error: 'invalid_profile', message: 'Send a goal, sex, birth year, height, weight and activity level.' }, 400)
  }
  const targets = calculateTargets(profile)
  if (!targets) {
    return c.json({ error: 'invalid_profile', message: 'Those numbers are outside the range we can work with.' }, 400)
  }

  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO fitness_body_profile
         (user_id, goal_type, sex, birth_year, height_cm, weight_kg, activity_level, bmr, tdee, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         goal_type = excluded.goal_type,
         sex = excluded.sex,
         birth_year = excluded.birth_year,
         height_cm = excluded.height_cm,
         weight_kg = excluded.weight_kg,
         activity_level = excluded.activity_level,
         bmr = excluded.bmr,
         tdee = excluded.tdee,
         updated_at = excluded.updated_at`,
    ).bind(
      session.userId,
      profile.goal_type,
      profile.sex,
      profile.birth_year,
      profile.height_cm,
      profile.weight_kg,
      profile.activity_level,
      targets.bmr,
      targets.tdee,
      now,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO fitness_profiles
         (user_id, calorie_target, protein_target_g, carbs_target_g, fat_target_g,
          fiber_target_g, water_target_ml, exercise_target_min, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         calorie_target = excluded.calorie_target,
         protein_target_g = excluded.protein_target_g,
         carbs_target_g = excluded.carbs_target_g,
         fat_target_g = excluded.fat_target_g,
         fiber_target_g = excluded.fiber_target_g,
         water_target_ml = excluded.water_target_ml,
         exercise_target_min = excluded.exercise_target_min,
         updated_at = excluded.updated_at`,
    ).bind(
      session.userId,
      targets.calorie_target,
      targets.protein_target_g,
      targets.carbs_target_g,
      targets.fat_target_g,
      targets.fiber_target_g,
      targets.water_target_ml,
      targets.exercise_target_min,
      now,
      now,
    ),
  ])

  return c.json({ targets })
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

// Get user goals with progress for the current local period
app.get('/api/fitness/goals', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const timezone = await resolveTimezone(c.env, session.userId, c.req.query('tz'))
  const today = localDate(timezone)
  const goals = await c.env.DB.prepare(
    'SELECT * FROM fitness_goals WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC',
  )
    .bind(session.userId)
    .all<Record<string, unknown>>()
  return c.json({
    goals: await addGoalProgress(c.env, session.userId, goals.results, today),
    date: today,
  })
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

  // The daily calorie target has one home: `fitness_profiles.calorie_target`.
  // The "Eat well" goal and the macro target are two views of the same
  // number, so setting either one sets the other - otherwise the dashboard
  // ends up showing two different daily calorie targets side by side.
  if (goalType === 'nutrition' && goalPeriod === 'day') {
    await c.env.DB.prepare(
      `UPDATE fitness_profiles
       SET calorie_target = ?, updated_at = ?
       WHERE user_id = ?`,
    )
      .bind(Math.round(target), now, session.userId)
      .run()
  }

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