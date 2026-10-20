// Habit tracker: 7-day rollup plus one-tap water, protein, and stretch adds.

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { resolveTimezone } from '../lib/profile'
import { getSession } from '../lib/session'
import { updateStreaks } from '../lib/streaks'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const HABIT_DAYS = 7
const QUICK_HABITS = {
  water: { min: 50, max: 2_000, unit: 'ml' },
  protein: { min: 5, max: 100, unit: 'g' },
  stretch: { min: 5, max: 180, unit: 'min' },
} as const
type QuickHabit = keyof typeof QUICK_HABITS

type HabitDay = {
  date: string
  water_ml: number
  protein_g: number
  sleep_hours: number
  stretch_min: number
}

function dayValue(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0
}

app.get('/api/fitness/habits', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const timezone = await resolveTimezone(c.env, session.userId, c.req.query('tz'))
  const today = localDate(timezone)
  const start = addDays(today, -(HABIT_DAYS - 1))

  const [logs, stretch, targets] = await Promise.all([
    c.env.DB.prepare(`
      SELECT recorded_at,
        SUM(CASE WHEN type = 'water' THEN COALESCE(water_ml, 0) ELSE 0 END) AS water_ml,
        SUM(CASE WHEN type = 'nutrition' THEN COALESCE(protein_g, 0) ELSE 0 END) AS protein_g,
        SUM(CASE WHEN type = 'sleep' THEN COALESCE(hours, duration_min, 0) ELSE 0 END) AS sleep_hours
      FROM fitness_logs
      WHERE user_id = ? AND recorded_at BETWEEN ? AND ?
      GROUP BY recorded_at
    `)
      .bind(session.userId, start, today)
      .all<{ recorded_at: string; water_ml: number | null; protein_g: number | null; sleep_hours: number | null }>(),
    c.env.DB.prepare(
      "SELECT recorded_at, value FROM fitness_habits WHERE user_id = ? AND habit = 'stretch' AND recorded_at BETWEEN ? AND ?",
    )
      .bind(session.userId, start, today)
      .all<{ recorded_at: string; value: number | null }>(),
    c.env.DB.prepare('SELECT protein_target_g FROM fitness_profiles WHERE user_id = ?')
      .bind(session.userId)
      .first<{ protein_target_g: number | null }>(),
  ])

  const byDate = new Map<string, HabitDay>()
  for (let index = 0; index < HABIT_DAYS; index += 1) {
    const date = addDays(start, index)
    byDate.set(date, { date, water_ml: 0, protein_g: 0, sleep_hours: 0, stretch_min: 0 })
  }
  for (const row of logs.results) {
    const day = byDate.get(row.recorded_at)
    if (!day) continue
    day.water_ml = dayValue(row.water_ml)
    day.protein_g = dayValue(row.protein_g)
    day.sleep_hours = dayValue(row.sleep_hours)
  }
  for (const row of stretch.results) {
    const day = byDate.get(row.recorded_at)
    if (day) day.stretch_min = dayValue(row.value)
  }

  const proteinTarget = dayValue(targets?.protein_target_g) || 100
  return c.json({
    date: today,
    days: [...byDate.values()],
    targets: {
      water_ml: 2_000,
      protein_g: proteinTarget,
      sleep_hours: 8,
      stretch_min: 10,
    },
  })
})

app.post('/api/fitness/habits/quick', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const habit = body.habit
  if (typeof habit !== 'string' || !(habit in QUICK_HABITS)) {
    return c.json({ error: 'invalid_habit', message: 'habit must be water, protein, or stretch.' }, 400)
  }
  const meta = QUICK_HABITS[habit as QuickHabit]
  const amount = body.amount
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < meta.min ||
    amount > meta.max
  ) {
    return c.json(
      { error: 'invalid_amount', message: `amount must be a whole number from ${meta.min}-${meta.max}${meta.unit}.` },
      400,
    )
  }

  const timezone = await resolveTimezone(c.env, session.userId, null)
  const today = localDate(timezone)
  const now = Date.now()

  let value = amount
  if (habit === 'water' || habit === 'protein') {
    const field = habit === 'water' ? 'water_ml' : 'protein_g'
    const type = habit === 'water' ? 'water' : 'nutrition'
    const activity = habit === 'water' ? 'Water' : 'Protein'
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO fitness_logs (
        id, user_id, type, recorded_at, activity, ${field}, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(newId(), session.userId, type, today, activity, amount, now, now)
      .run()
    await c.env.DB.prepare(`
      UPDATE fitness_logs SET ${field} = COALESCE(${field}, 0) + ?, updated_at = ?
      WHERE user_id = ? AND recorded_at = ? AND type = ?
    `)
      .bind(amount, now, session.userId, today, type)
      .run()
    const row = await c.env.DB.prepare(
      `SELECT ${field} AS value FROM fitness_logs WHERE user_id = ? AND recorded_at = ? AND type = ?`,
    )
      .bind(session.userId, today, type)
      .first<{ value: number | null }>()
    value = dayValue(row?.value)

    await updateStreaks(c.env, session.userId, timezone).catch((err) => {
      console.error('[habits] updateStreaks failed', err)
    })
  } else {
    await c.env.DB.prepare(`
      INSERT INTO fitness_habits (user_id, recorded_at, habit, value, created_at, updated_at)
      VALUES (?, ?, 'stretch', ?, ?, ?)
      ON CONFLICT(user_id, recorded_at, habit) DO UPDATE SET
        value = fitness_habits.value + excluded.value,
        updated_at = excluded.updated_at
    `)
      .bind(session.userId, today, amount, now, now)
      .run()
    const row = await c.env.DB.prepare(
      "SELECT value FROM fitness_habits WHERE user_id = ? AND recorded_at = ? AND habit = 'stretch'",
    )
      .bind(session.userId, today)
      .first<{ value: number | null }>()
    value = dayValue(row?.value)
  }

  return c.json({ habit, amount, value, date: today, unit: meta.unit })
})

export default app
