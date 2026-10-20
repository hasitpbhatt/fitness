// Fitness profile — timezone preferences used for day/week boundaries.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { backfillLocalDates } from '../lib/backfill'
import { getSession } from '../lib/session'
import { getFitnessProfile, saveFitnessTimezone } from '../lib/profile'
import { isValidTimezone } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

async function sessionUser(c: Context<{ Bindings: Bindings }>) {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  return session?.userId ?? null
}

app.get('/api/fitness/profile', async (c) => {
  const userId = await sessionUser(c)
  const hint = c.req.query('tz')
  const detected = hint && isValidTimezone(hint) ? hint : null

  if (!userId) {
    return c.json({ timezone: detected, confirmed: false, detected, signedIn: false })
  }

  let profile = await getFitnessProfile(c.env, userId)
  if (!profile?.timezone && detected) {
    await saveFitnessTimezone(c.env, userId, detected, 'auto')
    profile = { timezone: detected, timezone_source: 'auto' }
  } else if (profile?.timezone && profile.timezone_source === 'auto' && detected && detected !== profile.timezone) {
    // User moved or switched devices — refresh the unconfirmed guess.
    await saveFitnessTimezone(c.env, userId, detected, 'auto')
    profile = { timezone: detected, timezone_source: 'auto' }
  }

  return c.json({
    timezone: profile?.timezone ?? detected,
    confirmed: profile?.timezone_source === 'user',
    detected,
    signedIn: true,
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

export default app
