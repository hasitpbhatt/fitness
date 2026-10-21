// Fitness profile — timezone preferences used for day/week boundaries.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { backfillLocalDates } from '../lib/backfill'
import { newId } from '../lib/crypto'
import { getSession } from '../lib/session'
import { getFitnessProfile, saveFitnessTimezone } from '../lib/profile'
import { isValidTimezone } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const ONBOARDING_GOALS = {
  workout: { target: 150, min: 1, max: 10_000, period: 'week', unit: 'min' },
  nutrition: { target: 2_000, min: 100, max: 20_000, period: 'day', unit: 'kcal' },
  water: { target: 2_500, min: 100, max: 20_000, period: 'day', unit: 'ml' },
  sleep: { target: 8, min: 1, max: 24, period: 'day', unit: 'h' },
} as const

type OnboardingGoal = keyof typeof ONBOARDING_GOALS

async function sessionUser(c: Context<{ Bindings: Bindings }>) {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  return session?.userId ?? null
}

app.get('/api/fitness/profile', async (c) => {
  const userId = await sessionUser(c)
  const hint = c.req.query('tz')
  const detected = hint && isValidTimezone(hint) ? hint : null

  if (!userId) {
    return c.json({ timezone: detected, confirmed: false, detected, signedIn: false, onboarded: false })
  }

  let profile = await getFitnessProfile(c.env, userId)
  if (!profile?.timezone && detected) {
    await saveFitnessTimezone(c.env, userId, detected, 'auto')
    profile = { timezone: detected, timezone_source: 'auto', onboarding_complete: false }
  } else if (profile?.timezone && profile.timezone_source === 'auto' && detected && detected !== profile.timezone) {
    // User moved or switched devices — refresh the unconfirmed guess.
    await saveFitnessTimezone(c.env, userId, detected, 'auto')
    profile = { timezone: detected, timezone_source: 'auto', onboarding_complete: profile.onboarding_complete }
  }

  return c.json({
    timezone: profile?.timezone ?? detected,
    confirmed: profile?.timezone_source === 'user',
    detected,
    signedIn: true,
    onboarded: profile?.onboarding_complete ?? false,
  })
})

app.put('/api/fitness/profile', async (c) => {
  const userId = await sessionUser(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ timezone?: unknown }>().catch(() => null)
  const timezone = body?.timezone
  if (!isValidTimezone(timezone)) {
    return c.json({ error: 'invalid_timezone', message: 'Pick a valid timezone (IANA name, e.g. Asia/Kolkata).' }, 400)
  }

  const previous = await getFitnessProfile(c.env, userId)

  // Rows were dated in the unconfirmed zone (UTC or the auto guess). Repair
  // them on first confirmation only: once the user is confirmed, past days stay
  // where they were logged even if the user later travels or changes zones.
  // Do this before saving: if the backfill fails we must leave the old zone in
  // place so a retry can repair history instead of permanently skipping it.
  let backfilled = 0
  if (previous?.timezone_source !== 'user') {
    try {
      backfilled = await backfillLocalDates(c.env, userId, timezone)
    } catch (err) {
      console.error('[profile] timezone backfill failed', err)
      return c.json(
        {
          error: 'backfill_failed',
          message: "Couldn't re-date your history yet. Please try again.",
        },
        500,
      )
    }
  }

  await saveFitnessTimezone(c.env, userId, timezone, 'user')
  return c.json({ timezone, confirmed: true, detected: null, signedIn: true, backfilled })
})

// First-run setup: one focus goal plus the timezone used for day boundaries.
// The timezone is confirmed here, so repair history exactly like PUT /profile.
app.post('/api/fitness/onboarding', async (c) => {
  const userId = await sessionUser(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const goalType = body.goal_type
  if (typeof goalType !== 'string' || !Object.hasOwn(ONBOARDING_GOALS, goalType)) {
    return c.json(
      { error: 'invalid_goal', message: 'Pick a focus: workout, nutrition, water, or sleep.' },
      400,
    )
  }
  const config = ONBOARDING_GOALS[goalType as OnboardingGoal]

  const requestedTarget = body.goal_target ?? config.target
  if (
    typeof requestedTarget !== 'number' ||
    !Number.isFinite(requestedTarget) ||
    requestedTarget < config.min ||
    requestedTarget > config.max
  ) {
    return c.json(
      {
        error: 'invalid_target',
        message: `goal_target must be between ${config.min} and ${config.max} ${config.unit}.`,
      },
      400,
    )
  }

  const timezone = body.timezone
  if (!isValidTimezone(timezone)) {
    return c.json({ error: 'invalid_timezone', message: 'Pick a valid timezone (IANA name, e.g. Asia/Kolkata).' }, 400)
  }

  const previous = await getFitnessProfile(c.env, userId)
  if (previous?.timezone_source !== 'user') {
    try {
      await backfillLocalDates(c.env, userId, timezone)
    } catch (err) {
      console.error('[profile] onboarding timezone backfill failed', err)
      return c.json(
        { error: 'backfill_failed', message: "Couldn't set up your history yet. Please try again." },
        500,
      )
    }
  }

  const now = Date.now()
  const target = Math.round(requestedTarget)
  const existing = await c.env.DB.prepare(
    `SELECT id FROM fitness_goals
     WHERE user_id = ? AND type = ?
     ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(userId, goalType)
    .first<{ id: string }>()

  const goalStatement = existing
    ? c.env.DB.prepare(
        'UPDATE fitness_goals SET target = ?, period = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      ).bind(target, config.period, now, existing.id, userId)
    : c.env.DB.prepare(
        `INSERT INTO fitness_goals (id, user_id, type, target, current, period, updated_at, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      ).bind(newId(), userId, goalType, target, config.period, now, now)

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO fitness_profiles (
         user_id, timezone, timezone_source, onboarding_complete, created_at, updated_at
       ) VALUES (?, ?, 'user', 1, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         timezone = excluded.timezone,
         timezone_source = 'user',
         onboarding_complete = 1,
         updated_at = excluded.updated_at`,
    ).bind(userId, timezone, now, now),
    goalStatement,
  ])

  const goal = existing
    ? await c.env.DB.prepare('SELECT * FROM fitness_goals WHERE id = ? AND user_id = ?')
        .bind(existing.id, userId)
        .first()
    : await c.env.DB.prepare(
        'SELECT * FROM fitness_goals WHERE user_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(userId, goalType)
        .first()

  return c.json({
    onboarded: true,
    timezone,
    confirmed: true,
    goal,
    unit: config.unit,
    period: config.period,
  })
})

export default app
