import { Hono } from 'hono'
import authRoutes from '../../functions/routes/auth'
import fitnessRoutes from '../../functions/routes/fitness'
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

app.route('/', authRoutes)
app.route('/', fitnessRoutes)
app.route('/', profileRoutes)
app.route('/', scanRoutes)

export default app
