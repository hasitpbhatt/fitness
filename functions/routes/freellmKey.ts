// Member freellm key status.
//
// Every fitness member gets a freellm key automatically — no copy and paste.
// This endpoint only reports whether one exists and lets a member reset it.

import { Hono } from 'hono'
import { getSession } from '../lib/session'
import { getFitnessProfile } from '../lib/profile'
import { clearFreellmKey, ensureMemberFreellmKey } from '../lib/freellmKey'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/fitness/freellm-key', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const profile = await getFitnessProfile(c.env, session.userId)
  return c.json({
    has_key: Boolean(profile?.freellm_key_hash),
    updated_at: profile?.freellm_key_updated_at ?? null,
  })
})

app.put('/api/fitness/freellm-key', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const key = await ensureMemberFreellmKey(c.env, session.userId)
  if (!key) {
    return c.json(
      { error: 'not_configured', message: 'Key provisioning is not set up yet. Try again later.' },
      503,
    )
  }

  return c.json({ ok: true, has_key: true, updated_at: Date.now() })
})

app.delete('/api/fitness/freellm-key', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  await clearFreellmKey(c.env, session.userId)
  return c.json({ ok: true, has_key: false })
})

export default app
