import { Hono } from 'hono'
import adminMembersRoutes from '../../functions/routes/adminMembers'
import authRoutes from '../../functions/routes/auth'
import coachRoutes from '../../functions/routes/coach'
import entitlementRoutes from '../../functions/routes/entitlements'
import fitnessRoutes from '../../functions/routes/fitness'
import foodRoutes from '../../functions/routes/foods'
import habitRoutes from '../../functions/routes/habits'
import mealPlanRoutes from '../../functions/routes/mealPlan'
import measurementRoutes from '../../functions/routes/measurements'
import notificationRoutes from '../../functions/routes/notifications'
import profileRoutes from '../../functions/routes/profile'
import scanRoutes from '../../functions/routes/scan'
import type { Bindings } from '../../functions/lib/types'

const app = new Hono<{ Bindings: Bindings }>()

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

export default app
