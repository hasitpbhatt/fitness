// Member preferences: what the coach learns, and how the member can correct it.
//
// GET    /api/fitness/preferences      -> the current set
// PUT    /api/fitness/preferences      -> set it by hand
// DELETE /api/fitness/preferences      -> forget everything
// POST   /api/fitness/preferences/extract -> learn from a coach conversation
//
// The extract endpoint is called by the client after a coach reply. It only
// spends an AI call when the member's message actually looks like it carries a
// food or diet preference, so ordinary coaching stays free of extra cost.

import { Hono } from 'hono'
import {
  extractPreferences,
  getPreferences,
  hasPreferenceSignal,
  savePreferences,
  type Preferences,
} from '../lib/preferences'
import { resolveFreellmKey } from '../lib/freellmKey'
import { getSession } from '../lib/session'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const MAX_TRANSCRIPT_MESSAGES = 8
const MAX_USER_CHARS = 1_000
const MAX_ASSISTANT_CHARS = 2_000

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 24) return null
  const messages: ChatMessage[] = []
  for (const entry of raw.slice(-MAX_TRANSCRIPT_MESSAGES)) {
    if (!entry || typeof entry !== 'object') return null
    const role = (entry as { role?: unknown }).role
    const content = (entry as { content?: unknown }).content
    if (role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string') return null
    const trimmed = content.trim()
    if (!trimmed) return null
    const max = role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS
    if (trimmed.length > max) return null
    messages.push({ role, content: trimmed })
  }
  return messages.length ? messages : null
}

function asTagList(value: unknown, max = 12): string[] | null {
  if (!Array.isArray(value)) return null
  const result: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    const trimmed = entry.trim().toLowerCase()
    if (!trimmed || trimmed.length > 60) return null
    result.push(trimmed)
  }
  return result.slice(0, max)
}

function normalizeManual(raw: unknown): Preferences | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const diets = asTagList(input.diets)
  const allergens = asTagList(input.allergens)
  const avoid = asTagList(input.avoid)
  const likes = asTagList(input.likes)
  if (!diets || !allergens || !avoid || !likes) return null
  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 200) : ''
  return {
    diets,
    allergens,
    avoid,
    likes,
    notes,
    source: 'manual',
    updated_at: 0,
  }
}

app.get('/api/fitness/preferences', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)
  const preferences = await getPreferences(c.env, session.userId)
  return c.json({ preferences: preferences ?? null })
})

app.put('/api/fitness/preferences', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ preferences?: unknown }>().catch(() => null)
  const manual = normalizeManual(body?.preferences)
  if (!manual) {
    return c.json(
      { error: 'invalid_preferences', message: 'Send diets, allergens, avoid and likes as lists of short names.' },
      400,
    )
  }

  const saved = await savePreferences(c.env, session.userId, manual, 'manual')
  return c.json({ preferences: saved })
})

app.delete('/api/fitness/preferences', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  await c.env.DB.prepare('DELETE FROM fitness_preferences WHERE user_id = ?')
    .bind(session.userId)
    .run()
  await c.env.DB.prepare('DELETE FROM fitness_preference_updates WHERE user_id = ?')
    .bind(session.userId)
    .run()
  return c.json({ preferences: null })
})

app.post('/api/fitness/preferences/extract', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ messages?: unknown }>().catch(() => null)
  const messages = parseMessages(body?.messages)
  if (!messages) {
    return c.json(
      { error: 'invalid_messages', message: 'Send the last few chat messages so the coach can learn from them.' },
      400,
    )
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUserMessage || !hasPreferenceSignal(lastUserMessage.content)) {
    return c.json({ updated: false, reason: 'no_preference_detected', preferences: await getPreferences(c.env, session.userId) })
  }

  const memberKey = await resolveFreellmKey(c.env, session.userId)
  if (!memberKey) {
    return c.json({ error: 'upstream_error', message: 'Preferences cannot be updated right now.' }, 503)
  }

  const current = await getPreferences(c.env, session.userId)
  const transcript = messages
    .map((message) => `${message.role === 'user' ? 'Member' : 'Coach'}: ${message.content}`)
    .join('\n')

  const extracted = await extractPreferences(c.env, memberKey, transcript, current)
  if (!extracted) {
    return c.json(
      { updated: false, reason: 'extraction_failed', preferences: current },
      502,
    )
  }

  const saved = await savePreferences(
    c.env,
    session.userId,
    {
      diets: extracted.diets,
      allergens: extracted.allergens,
      avoid: extracted.avoid,
      likes: extracted.likes,
      notes: extracted.notes,
      source: 'coach',
      updated_at: 0,
    },
    'coach',
  )

  return c.json({ updated: true, preferences: saved })
})

export default app
