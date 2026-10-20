// Food database search and logging with portion scaling.

import { Hono } from 'hono'
import { resolveTimezone } from '../lib/profile'
import { getSession } from '../lib/session'
import { updateStreaks } from '../lib/streaks'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const CORRECTION_WINDOW_DAYS = 7
const MAX_PORTION_G = 5_000

type FoodRow = {
  id: string
  name: string
  brand: string | null
  category: string | null
  per_100g_calories: number
  per_100g_protein_g: number
  per_100g_carbs_g: number
  per_100g_fat_g: number
  default_portion_g: number
  portion_label: string | null
}

function correctionDate(value: unknown, today: string): string | null {
  if (value === null || value === undefined) return today
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (value > today) return null
  if (value < addDays(today, -CORRECTION_WINDOW_DAYS)) return null
  return value
}

function rounded(value: number) {
  return Math.round(value * 10) / 10
}

app.get('/api/fitness/foods', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const rawQuery = (c.req.query('q') ?? '').trim().slice(0, 80)
  const query = rawQuery.replace(/[%_]/g, '')
  const requested = Number(c.req.query('limit'))
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 20

  const base = `SELECT * FROM fitness_foods WHERE (user_id IS NULL OR user_id = ?)`
  const rows = query
    ? await c.env.DB.prepare(
        `${base} AND (name LIKE ? OR COALESCE(brand, '') LIKE ? OR COALESCE(category, '') LIKE ?)
         ORDER BY name LIMIT ?`,
      )
        .bind(session.userId, `%${query}%`, `%${query}%`, `%${query}%`, limit)
        .all()
    : await c.env.DB.prepare(`${base} ORDER BY name LIMIT ?`)
        .bind(session.userId, limit)
        .all()

  return c.json({ foods: rows.results })
})

app.post('/api/fitness/foods/log', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const timezone = await resolveTimezone(c.env, session.userId, null)
  const today = localDate(timezone)
  const recordedAt = correctionDate(body.date, today)
  if (!recordedAt) {
    return c.json(
      {
        error: 'invalid_date',
        message: `date must be today or within the last ${CORRECTION_WINDOW_DAYS} days (YYYY-MM-DD).`,
      },
      400,
    )
  }

  let name: string
  let grams = 0
  let calories: number
  let protein: number
  let carbs: number
  let fat: number

  if (typeof body.food_id === 'string') {
    const food = await c.env.DB.prepare(
      'SELECT * FROM fitness_foods WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
    )
      .bind(body.food_id, session.userId)
      .first<FoodRow>()
    if (!food) return c.json({ error: 'not_found', message: 'That food does not exist.' }, 404)

    const requestedGrams = body.grams === undefined || body.grams === null ? food.default_portion_g : body.grams
    if (
      typeof requestedGrams !== 'number' ||
      !Number.isFinite(requestedGrams) ||
      requestedGrams <= 0 ||
      requestedGrams > MAX_PORTION_G
    ) {
      return c.json({ error: 'invalid_portion', message: `grams must be 1-${MAX_PORTION_G}.` }, 400)
    }

    grams = rounded(requestedGrams)
    const factor = grams / 100
    name = food.name
    calories = Math.round(food.per_100g_calories * factor)
    protein = rounded(food.per_100g_protein_g * factor)
    carbs = rounded(food.per_100g_carbs_g * factor)
    fat = rounded(food.per_100g_fat_g * factor)
  } else {
    const manual = body.manual
    if (!manual || typeof manual !== 'object') {
      return c.json({ error: 'invalid_food', message: 'Send food_id or manual nutrition.' }, 400)
    }
    const item = manual as Record<string, unknown>
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) {
      return c.json({ error: 'invalid_name', message: 'name must be 1-100 characters.' }, 400)
    }
    const limits: Record<string, number> = {
      calories: 20_000,
      protein_g: 1_000,
      carbs_g: 1_000,
      fat_g: 1_000,
    }
    const values: Record<string, number> = {}
    for (const [field, limit] of Object.entries(limits)) {
      const value = item[field]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit) {
        return c.json({ error: 'invalid_field', message: `${field} is out of range.` }, 400)
      }
      values[field] = value
    }
    name = item.name.trim()
    calories = Math.round(values.calories)
    protein = rounded(values.protein_g)
    carbs = rounded(values.carbs_g)
    fat = rounded(values.fat_g)
  }

  const now = Date.now()
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO fitness_logs (
      id, user_id, type, recorded_at, activity, calories, protein_g, carbs_g, fat_g,
      created_at, updated_at
    ) VALUES (?, ?, 'nutrition', ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      crypto.randomUUID(),
      session.userId,
      recordedAt,
      name,
      calories,
      protein,
      carbs,
      fat,
      now,
      now,
    )
    .run()

  await c.env.DB.prepare(`
    UPDATE fitness_logs SET
      calories = COALESCE(calories, 0) + ?,
      protein_g = COALESCE(protein_g, 0) + ?,
      carbs_g = COALESCE(carbs_g, 0) + ?,
      fat_g = COALESCE(fat_g, 0) + ?,
      updated_at = ?
    WHERE user_id = ? AND recorded_at = ? AND type = 'nutrition'
  `)
    .bind(calories, protein, carbs, fat, now, session.userId, recordedAt)
    .run()

  await updateStreaks(c.env, session.userId, timezone).catch((err) => {
    console.error('[foods] updateStreaks failed', err)
  })

  const log = await c.env.DB.prepare(
    "SELECT * FROM fitness_logs WHERE user_id = ? AND recorded_at = ? AND type = 'nutrition'",
  )
    .bind(session.userId, recordedAt)
    .first()

  return c.json({
    log,
    item: { name, grams, calories, protein_g: protein, carbs_g: carbs, fat_g: fat },
    date: recordedAt,
  })
})

export default app
