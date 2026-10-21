// Baseline product telemetry. Events are deliberately narrow: status, latency,
// coarse properties, and an error code. No photos, descriptions, chat text, or
// other member-authored content ever goes into this table.

import type { MiddlewareHandler } from 'hono'
import { getSession } from './session'
import type { Bindings } from './types'

type TrackedEvent = {
  userId: string
  name: string
  surface: string | null
  status: number | null
  errorCode: string | null
  latencyMs: number | null
  properties: string | null
}

export async function recordEvent(env: Bindings, event: TrackedEvent): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO fitness_events (
         user_id, name, surface, status, error_code, latency_ms, properties, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        event.userId,
        event.name,
        event.surface,
        event.status,
        event.errorCode,
        event.latencyMs,
        event.properties,
        Date.now(),
      )
      .run()
  } catch (err) {
    console.error('[analytics] event write failed', event.name, err)
  }
}

function safeErrorCode(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null
}

/**
 * Records one event after the route finishes. A failed analytics write never
 * changes the member-facing response.
 */
export function trackEvent(
  name: 'scan_estimate' | 'scan_logged' | 'coach_reply',
  surface: string,
): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const started = Date.now()
    await next()

    const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
    if (!session) return

    let errorCode: string | null = null
    let properties: string | null = null
    try {
      const body = (await c.res.clone().json()) as Record<string, unknown> | null
      errorCode = safeErrorCode(body?.error)
      if (name === 'scan_estimate') {
        const details: Record<string, unknown> = { surface }
        if (Array.isArray(body?.items)) details.items = body.items.length
        if (typeof body?.needs_clarification === 'boolean') {
          details.needs_clarification = body.needs_clarification
        }
        properties = JSON.stringify(details).slice(0, 500)
      } else if (name === 'scan_logged') {
        const details: Record<string, unknown> = { surface }
        if (typeof body?.calories === 'number') details.calories = Math.round(body.calories)
        properties = JSON.stringify(details).slice(0, 500)
      }
    } catch {
      // Bodies can be empty or non-JSON; status and latency are still useful.
    }

    await recordEvent(c.env, {
      userId: session.userId,
      name,
      surface,
      status: c.res.status,
      errorCode,
      latencyMs: Math.max(0, Date.now() - started),
      properties,
    })
  }
}
