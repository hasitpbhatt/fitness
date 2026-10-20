// Body measurements: weight, waist, hips, and arms history.

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { resolveTimezone } from '../lib/profile'
import { getSession } from '../lib/session'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const MAX_BACKFILL_DAYS = 365
const FIELDS = {
  weight_kg: { min: 1, max: 500 },
  waist_cm: { min: 1, max: 300 },
  hips_cm: { min: 1, max: 300 },
  arms_cm: { min: 1, max: 300 },
} as const
type Field = keyof typeof FIELDS

function readMeasurement(value: unknown, field: Field): number | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const { min, max } = FIELDS[field]
  if (value < min || value > max) return undefined
  return Math.round(value * 10) / 10
}

function measurementDate(value: unknown, today: string): string | null {
  if (value === null || value === undefined) return today
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  if (value > today) return null
  if (value < addDays(today, -MAX_BACKFILL_DAYS)) return null
  return value
}

app.get('/api/fitness/measurements', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const requested = Number(c.req.query('limit'))
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 730) : 180
  const rows = await c.env.DB.prepare(
    `SELECT * FROM fitness_measurements
     WHERE user_id = ?
     ORDER BY recorded_at DESC
     LIMIT ?`,
  )
    .bind(session.userId, limit)
    .all()

  return c.json({ measurements: rows.results })
})

app.post('/api/fitness/measurements', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const timezone = await resolveTimezone(c.env, session.userId, null)
  const today = localDate(timezone)
  const recordedAt = measurementDate(body.date, today)
  if (!recordedAt) {
    return c.json(
      {
        error: 'invalid_date',
        message: `date must be today or within the last ${MAX_BACKFILL_DAYS} days (YYYY-MM-DD).`,
      },
      400,
    )
  }

  const values: Record<Field, number | null> = {
    weight_kg: null,
    waist_cm: null,
    hips_cm: null,
    arms_cm: null,
  }
  let provided = 0
  for (const field of Object.keys(FIELDS) as Field[]) {
    const parsed = readMeasurement(body[field], field)
    if (parsed === undefined) {
      return c.json({ error: 'invalid_field', message: `${field} is out of range.` }, 400)
    }
    if (parsed !== null) provided += 1
    values[field] = parsed
  }
  if (provided === 0) {
    return c.json({ error: 'no_measurements', message: 'Add at least one measurement.' }, 400)
  }

  let note: string | null = null
  if (body.note !== null && body.note !== undefined) {
    if (typeof body.note !== 'string' || body.note.length > 500) {
      return c.json({ error: 'invalid_note', message: 'note must be 500 characters or fewer.' }, 400)
    }
    note = body.note.trim() || null
  }

  const now = Date.now()
  await c.env.DB.prepare(`
    INSERT INTO fitness_measurements (
      id, user_id, recorded_at, weight_kg, waist_cm, hips_cm, arms_cm, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, recorded_at) DO UPDATE SET
      weight_kg = COALESCE(excluded.weight_kg, fitness_measurements.weight_kg),
      waist_cm = COALESCE(excluded.waist_cm, fitness_measurements.waist_cm),
      hips_cm = COALESCE(excluded.hips_cm, fitness_measurements.hips_cm),
      arms_cm = COALESCE(excluded.arms_cm, fitness_measurements.arms_cm),
      note = COALESCE(excluded.note, fitness_measurements.note),
      updated_at = excluded.updated_at
  `)
    .bind(
      newId(),
      session.userId,
      recordedAt,
      values.weight_kg,
      values.waist_cm,
      values.hips_cm,
      values.arms_cm,
      note,
      now,
      now,
    )
    .run()

  const measurement = await c.env.DB.prepare(
    'SELECT * FROM fitness_measurements WHERE user_id = ? AND recorded_at = ?',
  )
    .bind(session.userId, recordedAt)
    .first()
  return c.json({ measurement })
})

app.delete('/api/fitness/measurements/:id', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const result = await c.env.DB.prepare(
    'DELETE FROM fitness_measurements WHERE id = ? AND user_id = ?',
  )
    .bind(c.req.param('id'), session.userId)
    .run()
  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: 'not_found', message: 'That measurement does not exist.' }, 404)
  }
  return c.json({ ok: true, deleted: true })
})

export default app
