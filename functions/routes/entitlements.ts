// Staff-provisioned fitness access. No payments: admins grant free/plus/coach
// directly, trials expire lazily on read, and revoked access falls back to free.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { isAdmin } from '../lib/admin'
import {
  effectiveEntitlement,
  getEntitlement,
  type EntitlementRow,
  type FitnessTier,
} from '../lib/entitlements'
import { getSession } from '../lib/session'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const VALID_TIERS: FitnessTier[] = ['free', 'plus', 'coach']
const VALID_STATUSES = ['active', 'trial', 'revoked'] as const

type AccessRow = EntitlementRow & {
  id: string
  email: string
  username: string
  display_name: string | null
  created_at: number
  entitlement_updated_at: number | null
}

async function sessionUser(c: Context<{ Bindings: Bindings }>) {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  return session?.userId ?? null
}

app.get('/api/fitness/entitlement', async (c) => {
  const userId = await sessionUser(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ entitlement: await getEntitlement(c.env, userId), server_time: Date.now() })
})

app.get('/api/admin/entitlements', async (c) => {
  const adminId = await sessionUser(c)
  if (!adminId) return c.json({ error: 'unauthorized' }, 401)
  if (!(await isAdmin(c.env, adminId))) return c.json({ error: 'forbidden' }, 403)

  const rawLimit = Number(c.req.query('limit') ?? DEFAULT_LIMIT)
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    return c.json(
      { error: 'invalid_limit', message: `limit must be an integer from 1 to ${MAX_LIMIT}.` },
      400,
    )
  }

  const search = (c.req.query('q') ?? '').trim().slice(0, 100)
  const filters = search
    ? `WHERE instr(lower(u.email), lower(?)) > 0
        OR instr(lower(u.username), lower(?)) > 0
        OR instr(lower(COALESCE(u.display_name, '')), lower(?)) > 0`
    : ''
  const bindings: Array<string | number> = []
  if (search) bindings.push(search, search, search)
  bindings.push(rawLimit)

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.display_name, u.role, u.created_at,
       e.user_id AS entitlement_user_id, e.tier, e.status, e.trial_ends_at, e.ends_at,
       e.note, e.updated_at AS entitlement_updated_at
     FROM freellm_users u
     LEFT JOIN fitness_entitlements e ON e.user_id = u.id
     ${filters}
     ORDER BY u.created_at DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<AccessRow>()

  const now = Date.now()
  return c.json({
    members: rows.results.map((row) => ({
      user_id: row.id,
      email: row.email,
      username: row.username,
      display_name: row.display_name,
      role: row.role,
      created_at: row.created_at,
      entitlement_updated_at: row.entitlement_updated_at,
      ...effectiveEntitlement(row, now),
    })),
    server_time: now,
  })
})

app.put('/api/admin/entitlements/:userId', async (c) => {
  const adminId = await sessionUser(c)
  if (!adminId) return c.json({ error: 'unauthorized' }, 401)
  if (!(await isAdmin(c.env, adminId))) return c.json({ error: 'forbidden' }, 403)

  const targetId = c.req.param('userId')
  const target = await c.env.DB.prepare('SELECT id FROM freellm_users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string }>()
  if (!target) return c.json({ error: 'not_found', message: 'That member does not exist.' }, 404)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const tier = body.tier
  if (typeof tier !== 'string' || !VALID_TIERS.includes(tier as FitnessTier)) {
    return c.json({ error: 'invalid_tier', message: 'tier must be free, plus, or coach.' }, 400)
  }
  const status = body.status ?? 'active'
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return c.json(
      { error: 'invalid_status', message: 'status must be active, trial, or revoked.' },
      400,
    )
  }
  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null

  const now = Date.now()
  const selectedTier = tier as FitnessTier
  const selectedStatus = status as (typeof VALID_STATUSES)[number]
  let effectiveStatus: 'active' | 'trial' | 'revoked' = selectedStatus
  let trialEndsAt: number | null = null
  let endsAt: number | null = null

  if (selectedTier === 'free') {
    effectiveStatus = 'active'
  } else if (selectedStatus === 'trial') {
    const rawDays = body.trial_days ?? 14
    if (
      typeof rawDays !== 'number' ||
      !Number.isInteger(rawDays) ||
      rawDays < 1 ||
      rawDays > 90
    ) {
      return c.json(
        { error: 'invalid_trial_days', message: 'trial_days must be an integer from 1 to 90.' },
        400,
      )
    }
    trialEndsAt = now + rawDays * 24 * 60 * 60 * 1000
    endsAt = trialEndsAt
  }

  await c.env.DB.prepare(
    `INSERT INTO fitness_entitlements (
       user_id, tier, status, trial_ends_at, ends_at, granted_by, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       tier = excluded.tier,
       status = excluded.status,
       trial_ends_at = excluded.trial_ends_at,
       ends_at = excluded.ends_at,
       granted_by = excluded.granted_by,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  )
    .bind(targetId, selectedTier, effectiveStatus, trialEndsAt, endsAt, adminId, note, now, now)
    .run()

  return c.json({
    user_id: targetId,
    tier: selectedTier,
    status: effectiveStatus,
    trial_ends_at: trialEndsAt,
    ends_at: endsAt,
    note,
    entitlement: await getEntitlement(c.env, targetId),
  })
})

export default app
