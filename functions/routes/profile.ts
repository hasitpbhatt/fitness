// Fitness profile — timezone preferences used for day/week boundaries.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { backfillLocalDates } from '../lib/backfill'
import { newId } from '../lib/crypto'
import { getSession } from '../lib/session'
import { getFitnessProfile, saveFitnessTimezone } from '../lib/profile'
import { isValidTimezone } from '../lib/time'
import { calculateTargets, type ActivityLevel, type BodyProfile, type GoalType, type Sex } from '../lib/targets'
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
    profile = {
      timezone: detected,
      timezone_source: 'auto',
      onboarding_complete: false,
      freellm_key_hash: profile?.freellm_key_hash ?? null,
      freellm_key_updated_at: profile?.freellm_key_updated_at ?? null,
    }
  } else if (profile?.timezone && profile.timezone_source === 'auto' && detected && detected !== profile.timezone) {
    // User moved or switched devices — refresh the unconfirmed guess.
    await saveFitnessTimezone(c.env, userId, detected, 'auto')
    profile = {
      timezone: detected,
      timezone_source: 'auto',
      onboarding_complete: profile.onboarding_complete,
      freellm_key_hash: profile.freellm_key_hash,
      freellm_key_updated_at: profile.freellm_key_updated_at,
    }
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

// The body-profile form: the member answers a few questions and the app works
// out what they should eat, drink and do. Nobody is asked to do the maths.
const GOAL_TYPES: GoalType[] = ['lose', 'maintain', 'gain']
const SEXES: Sex[] = ['female', 'male']
const ACTIVITY_LEVELS: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'athlete']

function readProfile(raw: Record<string, unknown>): BodyProfile | null {
  const goalType = raw.goal_type
  const sex = raw.sex
  const activity = raw.activity_level
  const birthYear = Number(raw.birth_year)
  const height = Number(raw.height_cm)
  const weight = Number(raw.weight_kg)
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

/** Replaces the focus goals with the ones the calculation produced. */
async function writeCalculatedGoals(
  env: Bindings,
  userId: string,
  targets: { calorie_target: number; water_target_ml: number; exercise_target_min: number },
  now: number,
) {
  const wanted = [
    { type: 'nutrition', target: targets.calorie_target, period: 'day' },
    { type: 'water', target: targets.water_target_ml, period: 'day' },
    { type: 'workout', target: targets.exercise_target_min, period: 'week' },
    { type: 'sleep', target: 8, period: 'day' },
  ]
  const existing = await env.DB.prepare(
    'SELECT id, type FROM fitness_goals WHERE user_id = ?',
  )
    .bind(userId)
    .all<{ id: string; type: string }>()

  const statements = wanted.map((goal) => {
    const match = existing.results.find((row) => row.type === goal.type)
    return match
      ? env.DB.prepare(
          'UPDATE fitness_goals SET target = ?, period = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        ).bind(goal.target, goal.period, now, match.id, userId)
      : env.DB.prepare(
          `INSERT INTO fitness_goals (id, user_id, type, target, current, period, updated_at, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
        ).bind(newId(), userId, goal.type, goal.target, goal.period, now, now)
  })
  await env.DB.batch(statements)
}

// Onboarding with a body profile: the app does the arithmetic.
app.post('/api/fitness/onboarding/profile', async (c) => {
  const userId = await sessionUser(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const timezone = body.timezone
  if (!isValidTimezone(timezone)) {
    return c.json({ error: 'invalid_timezone', message: 'Pick a valid timezone (IANA name, e.g. Asia/Kolkata).' }, 400)
  }

  const profile = readProfile(body)
  if (!profile) {
    return c.json(
      { error: 'invalid_profile', message: 'Send a goal, sex, birth year, height, weight and activity level.' },
      400,
    )
  }
  const targets = calculateTargets(profile)
  if (!targets) {
    return c.json({ error: 'invalid_profile', message: 'Those numbers are outside the range we can work with.' }, 400)
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
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO fitness_profiles (
         user_id, timezone, timezone_source, onboarding_complete,
         calorie_target, protein_target_g, carbs_target_g, fat_target_g,
         fiber_target_g, water_target_ml, exercise_target_min,
         goal_type, sex, birth_year, height_cm, weight_kg, activity_level,
         created_at, updated_at)
       VALUES (?, ?, 'user', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         timezone = excluded.timezone,
         timezone_source = 'user',
         onboarding_complete = 1,
         calorie_target = excluded.calorie_target,
         protein_target_g = excluded.protein_target_g,
         carbs_target_g = excluded.carbs_target_g,
         fat_target_g = excluded.fat_target_g,
         fiber_target_g = excluded.fiber_target_g,
         water_target_ml = excluded.water_target_ml,
         exercise_target_min = excluded.exercise_target_min,
         goal_type = excluded.goal_type,
         sex = excluded.sex,
         birth_year = excluded.birth_year,
         height_cm = excluded.height_cm,
         weight_kg = excluded.weight_kg,
         activity_level = excluded.activity_level,
         updated_at = excluded.updated_at`,
    ).bind(
      userId,
      timezone,
      targets.calorie_target,
      targets.protein_target_g,
      targets.carbs_target_g,
      targets.fat_target_g,
      targets.fiber_target_g,
      targets.water_target_ml,
      targets.exercise_target_min,
      profile.goal_type,
      profile.sex,
      profile.birth_year,
      profile.height_cm,
      profile.weight_kg,
      profile.activity_level,
      now,
      now,
    ),
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
      userId,
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
  ])

  await writeCalculatedGoals(c.env, userId, targets, now)

  return c.json({ onboarded: true, timezone, confirmed: true, targets })
})

export default app
