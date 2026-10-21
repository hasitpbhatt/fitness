// Read-only member directory for admins. Grants, content, and coaching tools
// land with their own features; this gives support a single place to see who is
// active, timezone-confirmed, and progressing toward a goal.

import { Hono } from 'hono'
import { isAdmin } from '../lib/admin'
import { getSession } from '../lib/session'
import { addDays, localDate } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type DirectoryRow = {
  id: string
  email: string
  username: string
  display_name: string | null
  role: string
  tier: string | null
  created_at: number
  timezone: string | null
  timezone_source: string | null
  goal_count: number
  last_log_date: string | null
  logs_7d: number
}

async function adminUserId(
  env: Bindings,
  cookie: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const session = await getSession(env.fitness_sessions, cookie)
  if (!session) return { ok: false, status: 401 }
  if (!(await isAdmin(env, session.userId))) return { ok: false, status: 403 }
  return { ok: true, userId: session.userId }
}

app.get('/api/admin/members', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const rawLimit = Number(c.req.query('limit') ?? DEFAULT_LIMIT)
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    return c.json(
      { error: 'invalid_limit', message: `limit must be an integer from 1 to ${MAX_LIMIT}.` },
      400,
    )
  }

  const search = (c.req.query('q') ?? '').trim().slice(0, 100)
  const cutoff = addDays(localDate('UTC'), -6)
  const filters = search
    ? `WHERE instr(lower(u.email), lower(?)) > 0
        OR instr(lower(u.username), lower(?)) > 0
        OR instr(lower(COALESCE(u.display_name, '')), lower(?)) > 0`
    : ''
  const bindings: Array<string | number> = [cutoff]
  if (search) bindings.push(search, search, search)
  bindings.push(rawLimit)

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.username, u.display_name, u.role, u.tier, u.created_at,
       p.timezone, p.timezone_source,
       (SELECT COUNT(*) FROM fitness_goals g WHERE g.user_id = u.id) AS goal_count,
       (SELECT MAX(l.recorded_at) FROM fitness_logs l WHERE l.user_id = u.id) AS last_log_date,
       (SELECT COUNT(*) FROM fitness_logs l WHERE l.user_id = u.id AND l.recorded_at >= ?) AS logs_7d
     FROM freellm_users u
     LEFT JOIN fitness_profiles p ON p.user_id = u.id
     ${filters}
     ORDER BY COALESCE(
       (SELECT MAX(l.created_at) FROM fitness_logs l WHERE l.user_id = u.id),
       u.created_at
     ) DESC
     LIMIT ?`,
  )
    .bind(...bindings)
    .all<DirectoryRow>()

  return c.json({
    members: rows.results.map((row) => ({
      ...row,
      tier: row.tier ?? 'free',
      logs_7d: Number(row.logs_7d ?? 0),
      goal_count: Number(row.goal_count ?? 0),
    })),
    window_start: cutoff,
    generated_at: Date.now(),
  })
})

export default app
