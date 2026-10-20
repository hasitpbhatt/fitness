// In-app notifications: member feed, view/dismiss tracking, and admin compose.
// Push delivery remains deferred until VAPID keys and a dispatcher exist.

import { Hono } from 'hono'
import { isAdmin } from '../lib/admin'
import { newId } from '../lib/crypto'
import { getSession } from '../lib/session'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const AUDIENCES = new Set(['all', 'free', 'pro', 'enterprise'])
const MAX_TITLE = 120
const MAX_BODY = 500
const MAX_URL = 200

type NotificationRow = {
  id: string
  user_id: string | null
  title: string
  body: string
  url: string | null
  audience: string
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled'
  sticky: number
  send_at: number | null
  sent_at: number | null
  created_by: string
  created_at: number
  updated_at: number
}

type MemberRow = {
  id: string
  title: string
  body: string
  url: string | null
  sticky: number
  send_at: number
  sent_at: number | null
  viewed: number
  dismissed: number
}

type AdminRow = NotificationRow & { views: number; dismissals: number }

async function sessionUserId(env: Bindings, cookie: string | null): Promise<string | null> {
  const session = await getSession(env.fitness_sessions, cookie)
  return session?.userId ?? null
}

async function adminUserId(
  env: Bindings,
  cookie: string | null,
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 }> {
  const userId = await sessionUserId(env, cookie)
  if (!userId) return { ok: false, status: 401 }
  if (!(await isAdmin(env, userId))) return { ok: false, status: 403 }
  return { ok: true, userId }
}

async function memberTier(env: Bindings, userId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT tier FROM freellm_users WHERE id = ?')
    .bind(userId)
    .first<{ tier: string }>()
  return row?.tier ?? 'free'
}

function visibleClause(): string {
  return `n.send_at IS NOT NULL AND n.send_at <= ?
    AND n.status IN ('sent', 'scheduled')
    AND (n.audience = 'all' OR n.audience = ? OR n.user_id = ?)`
}

async function visibleNotification(
  env: Bindings,
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const tier = await memberTier(env, userId)
  const row = await env.DB.prepare(
    `SELECT n.id
     FROM fitness_notifications n
     LEFT JOIN fitness_notification_views v
       ON v.notification_id = n.id AND v.user_id = ?
     WHERE n.id = ? AND ${visibleClause()} AND v.dismissed_at IS NULL`,
  )
    .bind(userId, notificationId, Date.now(), tier, userId)
    .first<{ id: string }>()
  return Boolean(row)
}

async function markNotification(
  env: Bindings,
  userId: string,
  notificationId: string,
  mode: 'view' | 'dismiss',
): Promise<boolean> {
  if (!(await visibleNotification(env, userId, notificationId))) return false
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO fitness_notification_views
       (notification_id, user_id, viewed_at, dismissed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(notification_id, user_id) DO UPDATE SET
       viewed_at = COALESCE(fitness_notification_views.viewed_at, excluded.viewed_at),
       dismissed_at = COALESCE(fitness_notification_views.dismissed_at, excluded.dismissed_at)`,
  )
    .bind(notificationId, userId, now, mode === 'dismiss' ? now : null)
    .run()
  return true
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : null
}

function cleanUrl(value: unknown): string | null | false {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return false
  const url = value.trim()
  if (!url.startsWith('/') || url.startsWith('//') || url.length > MAX_URL) return false
  return url
}

// ------------------------------------------------------------- member feed

app.get('/api/fitness/notifications', async (c) => {
  const userId = await sessionUserId(c.env, c.req.header('cookie') ?? null)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const tier = await memberTier(c.env, userId)
  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.title, n.body, n.url, n.sticky, n.send_at, n.sent_at,
       CASE WHEN v.viewed_at IS NULL THEN 0 ELSE 1 END AS viewed,
       CASE WHEN v.dismissed_at IS NULL THEN 0 ELSE 1 END AS dismissed
     FROM fitness_notifications n
     LEFT JOIN fitness_notification_views v
       ON v.notification_id = n.id AND v.user_id = ?
     WHERE ${visibleClause()} AND v.dismissed_at IS NULL
     ORDER BY n.send_at DESC, n.created_at DESC
     LIMIT 20`,
  )
    .bind(userId, Date.now(), tier, userId)
    .all<MemberRow>()

  const notifications = rows.results
  return c.json({
    notifications,
    unread: notifications.filter((item) => item.viewed === 0).length,
  })
})

app.post('/api/fitness/notifications/:id/view', async (c) => {
  const userId = await sessionUserId(c.env, c.req.header('cookie') ?? null)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const marked = await markNotification(c.env, userId, c.req.param('id'), 'view')
  if (!marked) return c.json({ error: 'not_found', message: 'That notification is not available.' }, 404)
  return c.json({ ok: true })
})

app.post('/api/fitness/notifications/:id/dismiss', async (c) => {
  const userId = await sessionUserId(c.env, c.req.header('cookie') ?? null)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const marked = await markNotification(c.env, userId, c.req.param('id'), 'dismiss')
  if (!marked) return c.json({ error: 'not_found', message: 'That notification is not available.' }, 404)
  return c.json({ ok: true })
})

// --------------------------------------------------------------- admin list

app.get('/api/admin/notifications', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const rows = await c.env.DB.prepare(
    `SELECT n.*,
       COUNT(v.viewed_at) AS views,
       COALESCE(SUM(CASE WHEN v.dismissed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS dismissals
     FROM fitness_notifications n
     LEFT JOIN fitness_notification_views v ON v.notification_id = n.id
     GROUP BY n.id
     ORDER BY n.created_at DESC
     LIMIT 100`,
  ).all<AdminRow>()

  return c.json({ notifications: rows.results })
})

app.post('/api/admin/notifications', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const body = await c.req.json<Record<string, unknown>>().catch(() => null)
  if (!body) return c.json({ error: 'invalid_body', message: 'Send a JSON body.' }, 400)

  const title = cleanText(body.title, MAX_TITLE)
  const text = cleanText(body.body, MAX_BODY)
  const url = cleanUrl(body.url)
  if (!title || !text) {
    return c.json(
      { error: 'invalid_content', message: `title (1-${MAX_TITLE}) and body (1-${MAX_BODY}) are required.` },
      400,
    )
  }
  if (url === false) {
    return c.json({ error: 'invalid_url', message: 'url must be an internal path beginning with /.' }, 400)
  }

  const audience = typeof body.audience === 'string' ? body.audience : 'all'
  if (!AUDIENCES.has(audience)) {
    return c.json({ error: 'invalid_audience', message: 'Pick a valid audience.' }, 400)
  }

  let sendAt: number | null = null
  if (body.send_at !== null && body.send_at !== undefined) {
    if (typeof body.send_at !== 'number' || !Number.isFinite(body.send_at) || body.send_at <= 0) {
      return c.json({ error: 'invalid_schedule', message: 'send_at must be an epoch timestamp.' }, 400)
    }
    sendAt = Math.floor(body.send_at)
  }

  const now = Date.now()
  const status = sendAt === null ? 'draft' : sendAt <= now ? 'sent' : 'scheduled'
  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO fitness_notifications
       (id, user_id, title, body, url, audience, status, sticky, send_at, sent_at,
        created_by, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      title,
      text,
      url,
      audience,
      status,
      body.sticky === true ? 1 : 0,
      sendAt,
      status === 'sent' ? now : null,
      admin.userId,
      now,
      now,
    )
    .run()

  return c.json({ id, status }, 201)
})

app.post('/api/admin/notifications/:id/send', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const row = await c.env.DB.prepare('SELECT * FROM fitness_notifications WHERE id = ?')
    .bind(c.req.param('id'))
    .first<NotificationRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.status === 'cancelled') {
    return c.json({ error: 'cancelled', message: 'A cancelled notification cannot be sent.' }, 409)
  }

  const now = Date.now()
  await c.env.DB.prepare(
    `UPDATE fitness_notifications
     SET status = 'sent', send_at = ?, sent_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(now, now, now, row.id)
    .run()
  return c.json({ ok: true, status: 'sent' })
})

app.post('/api/admin/notifications/:id/cancel', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const row = await c.env.DB.prepare('SELECT * FROM fitness_notifications WHERE id = ?')
    .bind(c.req.param('id'))
    .first<NotificationRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)
  if (row.status === 'sent') {
    return c.json({ error: 'already_sent', message: 'A sent notification cannot be cancelled.' }, 409)
  }
  if (row.status === 'cancelled') return c.json({ ok: true, status: 'cancelled' })

  await c.env.DB.prepare(
    "UPDATE fitness_notifications SET status = 'cancelled', updated_at = ? WHERE id = ?",
  )
    .bind(Date.now(), row.id)
    .run()
  return c.json({ ok: true, status: 'cancelled' })
})

app.post('/api/admin/notifications/:id/test', async (c) => {
  const admin = await adminUserId(c.env, c.req.header('cookie') ?? null)
  if (!admin.ok) return c.json({ error: admin.status === 401 ? 'unauthorized' : 'forbidden' }, admin.status)

  const row = await c.env.DB.prepare('SELECT * FROM fitness_notifications WHERE id = ?')
    .bind(c.req.param('id'))
    .first<NotificationRow>()
  if (!row) return c.json({ error: 'not_found' }, 404)

  const now = Date.now()
  const id = newId()
  await c.env.DB.prepare(
    `INSERT INTO fitness_notifications
       (id, user_id, title, body, url, audience, status, sticky, send_at, sent_at,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'test', 'sent', 0, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      admin.userId,
      `Test: ${row.title}`.slice(0, MAX_TITLE),
      row.body,
      row.url,
      now,
      now,
      admin.userId,
      now,
      now,
    )
    .run()
  return c.json({ id, ok: true })
})

export default app
