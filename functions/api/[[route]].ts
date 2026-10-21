import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import adminMembersRoutes from '../routes/adminMembers'
import authRoutes from '../routes/auth'
import coachRoutes from '../routes/coach'
import entitlementRoutes from '../routes/entitlements'
import fitnessRoutes from '../routes/fitness'
import foodRoutes from '../routes/foods'
import habitRoutes from '../routes/habits'
import mealPlanRoutes from '../routes/mealPlan'
import measurementRoutes from '../routes/measurements'
import notificationRoutes from '../routes/notifications'
import profileRoutes from '../routes/profile'
import scanRoutes from '../routes/scan'
import type { Bindings, Variables } from '../lib/types'

/**
 * fitness.hasit.in API — Cloudflare Pages Functions (Workers runtime).
 *
 * Bindings (see wrangler.toml):
 *   DB                — D1 (SQLite): shared hasit-in database (freellm_users identity + fitness_* tables)
 *   fitness_sessions  — KV: session tokens, OAuth state, rate limits
 *   ENVIRONMENT       — 'development' | 'production'
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — OAuth
 *   ADMIN_EMAIL       — address that auto-gets the admin role at registration
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path} failed:`, err)
  return new Response(JSON.stringify({ error: 'internal_error', message: 'Something broke on our side.' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
})

app.notFound((c) => c.json({ error: 'not_found', message: `No route for ${c.req.path}` }, 404))

// ---------------------------------------------------------------- health
app.get('/api/health', async (c) => {
  let db: 'ok' | 'error' = 'error'
  try {
    await c.env.DB.prepare('SELECT 1 AS ping').first()
    db = 'ok'
  } catch {
    db = 'error'
  }
  return c.json({ ok: db === 'ok', env: c.env.ENVIRONMENT, db })
})

// ------------------------------------------------------------- routers
app.route('/', adminMembersRoutes)
app.route('/', authRoutes)
app.route('/', coachRoutes)
app.route('/', entitlementRoutes)
app.route('/', fitnessRoutes)
app.route('/', foodRoutes)
app.route('/', habitRoutes)
app.route('/', mealPlanRoutes)
app.route('/', measurementRoutes)
app.route('/', notificationRoutes)
app.route('/', profileRoutes)
app.route('/', scanRoutes)

export const onRequest = handle(app)