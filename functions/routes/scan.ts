// AI meal estimates — photo scanning and text-only descriptions, proxied
// through freellm.hasit.in.
//
// Flow:
//   POST /api/fitness/scan          photo data URI -> detected items + totals
//   POST /api/fitness/scan/text     written description -> likely ingredients
//   POST /api/fitness/scan/refine   corrected description -> rebuilt estimate
//   POST /api/fitness/log/scan      confirmed items -> today's nutrition log
//
// The freellm API key is a server-side secret; clients never see it. Estimates
// share an atomic per-user daily budget and images are size-bounded before they
// leave the app. Photo estimates use a vision model; text-only corrections use
// a larger text model because no image is sent.

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { getFitnessProfile, resolveTimezone } from '../lib/profile'
import { getSession } from '../lib/session'
import { updateStreaks } from '../lib/streaks'
import { localDate, quotaDay } from '../lib/time'
import type { Bindings } from '../lib/types'

const app = new Hono<{ Bindings: Bindings }>()

const MAX_IMAGE_CHARS = 10_000_000 // ~7.5 MB binary once base64 is decoded
const MAX_ITEMS = 20
const MAX_QUESTIONS = 5
const SCANS_PER_DAY = 20
const MAX_SCANS_STORED = 30
const UPSTREAM_TIMEOUT_MS = 60_000
const DEFAULT_BASE_URL = 'https://freellm.hasit.in/v1'
const DEFAULT_VL_MODEL = 'nemotron-3-5-super-vl'
const DEFAULT_TEXT_MODEL = 'nemotron-3-ultra-550b-a55b'
const IMAGE_DATA_URI = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/
const DESCRIPTION_FALLBACK_LOW = 0.8
const DESCRIPTION_FALLBACK_HIGH = 1.2

const SCHEMA_PROMPT = `You are a nutrition estimation assistant. Return ONLY valid JSON with no markdown and no explanations, matching this schema exactly:
{"description":string,"items":[{"name":string,"qty":number,"unit":string,"calories":number,"calories_low":number,"calories_high":number,"protein_g":number,"fat_g":number,"carbs_g":number,"confidence":number}],"totals":{"calories":number,"calories_low":number,"calories_high":number,"protein_g":number,"fat_g":number,"carbs_g":number},"needs_clarification":boolean,"questions":[{"item_name":string,"question":string}]}
Rules:
- description is a short dish name for the whole meal, e.g. "Grilled chicken with rice and salad".
- Identify each distinct visible food or drink item separately.
- Estimate portion in grams, millilitres, or common units (slice, cup, piece).
- calories_low and calories_high must bracket a realistic uncertainty range. Use roughly -20%/+20% when the portion is clear, and a wider range when it is not.
- confidence is 0..1. If a portion or the food type is ambiguous, lower confidence and add a specific clarification question instead of guessing.
- Prefer typical USDA-like values. Do not invent brand names.
- If nothing edible is visible, return an empty items array with needs_clarification true and one question.`

const TEXT_ONLY_RULES = `No photo is available. The written description is the only input.
- Break the meal into its likely ingredients and dishes.
- Use typical portions, but mark the result as uncertain.
- Always set needs_clarification true and ask up to 3 short questions that let the user fill in the quantity or portion of the main items (for example: "How much rice — about 1 cup?").
- If the description already states a quantity, do not ask about that item again.`

const TEXT_REBUILD_RULES = `You are rebuilding an estimate from a corrected meal description. Treat the corrected description as authoritative.
- Rebuild the item list from the description instead of renaming the previous items.
- Use typical portions when the description does not state them, and ask the user to fill in the most important missing quantities.
- Keep items the description does not contradict, but recompute every total.`

type ScanItem = {
  name: string
  qty: number
  unit: string
  calories: number
  calories_low: number
  calories_high: number
  protein_g: number
  fat_g: number
  carbs_g: number
  confidence: number
}

type ScanTotals = {
  calories: number
  calories_low: number
  calories_high: number
  protein_g: number
  fat_g: number
  carbs_g: number
}

type ScanQuestion = { item_name?: string; question: string }

type Quota = { used: number; limit: number }

type ScanResult = {
  scan_id: string
  description: string
  items: ScanItem[]
  totals: ScanTotals
  needs_clarification: boolean
  questions: ScanQuestion[]
  model: string
}

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function fallbackDescription(items: ScanItem[]): string {
  return items
    .map((item) => item.name)
    .join(', ')
    .slice(0, 160)
}

function cleanDescription(value: unknown, items: ScanItem[]): string {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 160)
  return fallbackDescription(items)
}

/** Validates and clamps a raw item array (used for both model output and client edits). */
function normalizeItems(raw: unknown): ScanItem[] {
  if (!Array.isArray(raw)) return []
  const items: ScanItem[] = []
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 120) : ''
    if (!name) continue
    const calories = Math.round(numberIn(item.calories, 0, 20_000, 0))
    const rawLow = Math.round(
      numberIn(item.calories_low, 0, 20_000, Math.round(calories * DESCRIPTION_FALLBACK_LOW)),
    )
    const rawHigh = Math.round(
      numberIn(item.calories_high, 0, 20_000, Math.round(calories * DESCRIPTION_FALLBACK_HIGH)),
    )
    items.push({
      name,
      qty: round1(numberIn(item.qty, 0.1, 10_000, 1)),
      unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim().slice(0, 24) : 'serving',
      calories,
      calories_low: Math.min(rawLow, calories),
      calories_high: Math.max(rawHigh, calories),
      protein_g: round1(numberIn(item.protein_g, 0, 2_000, 0)),
      fat_g: round1(numberIn(item.fat_g, 0, 2_000, 0)),
      carbs_g: round1(numberIn(item.carbs_g, 0, 2_000, 0)),
      confidence: round1(numberIn(item.confidence, 0, 1, 0.5)),
    })
  }
  return items
}

function sumTotals(items: ScanItem[]): ScanTotals {
  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      calories_low: acc.calories_low + item.calories_low,
      calories_high: acc.calories_high + item.calories_high,
      protein_g: acc.protein_g + item.protein_g,
      fat_g: acc.fat_g + item.fat_g,
      carbs_g: acc.carbs_g + item.carbs_g,
    }),
    { calories: 0, calories_low: 0, calories_high: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  )
  const calories = Math.round(totals.calories)
  return {
    calories,
    calories_low: Math.min(Math.round(totals.calories_low), calories),
    calories_high: Math.max(Math.round(totals.calories_high), calories),
    protein_g: round1(totals.protein_g),
    fat_g: round1(totals.fat_g),
    carbs_g: round1(totals.carbs_g),
  }
}

function normalizeQuestions(raw: unknown): ScanQuestion[] {
  if (!Array.isArray(raw)) return []
  const questions: ScanQuestion[] = []
  for (const entry of raw.slice(0, MAX_QUESTIONS)) {
    if (!entry || typeof entry !== 'object') continue
    const question = (entry as { question?: unknown }).question
    if (typeof question !== 'string' || !question.trim()) continue
    const itemName = (entry as { item_name?: unknown }).item_name
    questions.push({
      ...(typeof itemName === 'string' && itemName.trim() ? { item_name: itemName.trim().slice(0, 120) } : {}),
      question: question.trim().slice(0, 300),
    })
  }
  return questions
}

function normalizeResult(
  raw: unknown,
  scanId: string,
  model: string,
  descriptionFallback = '',
): ScanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const items = normalizeItems(obj.items)
  const questions = normalizeQuestions(obj.questions)
  const needsClarification = obj.needs_clarification === true || questions.length > 0
  if (items.length === 0 && !needsClarification) return null
  return {
    scan_id: scanId,
    description: cleanDescription(obj.description, items) || descriptionFallback.slice(0, 160),
    items,
    totals: sumTotals(items),
    needs_clarification: needsClarification,
    questions,
    model,
  }
}

/** Pulls the first JSON object out of a model reply, tolerating fences or prose. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

type UpstreamOk = { ok: true; content: string }
type UpstreamError = { ok: false; status: 429 | 502 | 503; message: string }

async function callFreellm(
  env: Bindings,
  model: string,
  messages: unknown[],
  maxTokens: number,
): Promise<UpstreamOk | UpstreamError> {
  const key = env.FREELLM_API_KEY
  if (!key) {
    return { ok: false, status: 503, message: 'AI meal estimates are not set up yet.' }
  }
  const base = (env.FREELLM_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      console.error('[scan] freellm returned', response.status, model, detail)
      if (response.status === 402 || response.status === 429) {
        return {
          ok: false,
          status: 429,
          message: 'Meal estimating is busy right now — try again in a minute.',
        }
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: 503, message: 'AI meal estimates are not set up correctly.' }
      }
      return { ok: false, status: 502, message: 'The model could not process that request. Try again.' }
    }
    const data = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: unknown } }> }
      | null
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, status: 502, message: 'The model returned an empty answer. Try again.' }
    }
    return { ok: true, content }
  } catch (err) {
    console.error('[scan] freellm request failed', model, err)
    return { ok: false, status: 502, message: 'The model did not respond in time. Try again.' }
  }
}

/**
 * Quota days must not be caller-controlled. Use the confirmed profile zone, or
 * UTC until the user confirms; timezone hints are intentionally ignored here so
 * rotating hints cannot mint extra daily budgets.
 */
async function quotaDate(env: Bindings, userId: string): Promise<string> {
  const profile = await getFitnessProfile(env, userId)
  return quotaDay(profile?.timezone_source, profile?.timezone)
}

/** Atomic daily budget shared by photo scans and text-only estimates. */
async function consumeScanQuota(
  env: Bindings,
  userId: string,
  date: string,
): Promise<{ quota: Quota; allowed: boolean }> {
  const row = await env.DB.prepare(
    `INSERT INTO fitness_scan_usage (user_id, date, count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       count = count + 1,
       updated_at = excluded.updated_at
     WHERE count < ?
     RETURNING count`,
  )
    .bind(userId, date, Date.now(), SCANS_PER_DAY)
    .first<{ count: number }>()
  if (row) return { quota: { used: row.count, limit: SCANS_PER_DAY }, allowed: true }

  // At the ceiling the upsert changes nothing; report the stored count instead
  // of incrementing it on every blocked attempt.
  const current = await env.DB.prepare(
    'SELECT count FROM fitness_scan_usage WHERE user_id = ? AND date = ?',
  )
    .bind(userId, date)
    .first<{ count: number }>()
  return {
    quota: { used: Math.min(current?.count ?? SCANS_PER_DAY, SCANS_PER_DAY), limit: SCANS_PER_DAY },
    allowed: false,
  }
}

/** Failed estimates should not spend the user's daily budget. */
async function refundScanQuota(env: Bindings, userId: string, date: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE fitness_scan_usage
     SET count = MAX(count - 1, 0), updated_at = ?
     WHERE user_id = ? AND date = ?`,
  )
    .bind(Date.now(), userId, date)
    .run()
    .catch(() => {})
}

function timezoneHint(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

// Read the daily budget without spending it, so the capture screen can warn
// before the user picks a photo or types a description.
app.get('/api/fitness/scan/quota', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const date = await quotaDate(c.env, session.userId)
  const row = await c.env.DB.prepare(
    'SELECT count FROM fitness_scan_usage WHERE user_id = ? AND date = ?',
  )
    .bind(session.userId, date)
    .first<{ count: number }>()
  const used = Math.min(row?.count ?? 0, SCANS_PER_DAY)
  return c.json({
    quota: { used, limit: SCANS_PER_DAY },
    remaining: SCANS_PER_DAY - used,
    configured: Boolean(c.env.FREELLM_API_KEY),
    date,
  })
})

// ------------------------------------------------------------------ scan

app.post('/api/fitness/scan', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ image?: unknown; timezone?: unknown }>().catch(() => null)
  const image = typeof body?.image === 'string' ? body.image : ''
  if (!image || image.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URI.test(image)) {
    return c.json(
      { error: 'invalid_image', message: 'Send a JPEG, PNG, or WebP photo (max ~7 MB).' },
      400,
    )
  }
  if (!c.env.FREELLM_API_KEY) {
    return c.json({ error: 'upstream_error', message: 'AI meal estimates are not set up yet.' }, 503)
  }

  const date = await quotaDate(c.env, session.userId)
  const { quota, allowed } = await consumeScanQuota(c.env, session.userId, date)
  if (!allowed) {
    return c.json(
      {
        error: 'rate_limited',
        message: `You've used all ${SCANS_PER_DAY} AI meal estimates for today — try again tomorrow.`,
        quota,
      },
      429,
    )
  }

  const scanId = newId()
  const model = c.env.FREELLM_VL_MODEL ?? DEFAULT_VL_MODEL
  const messages = [
    { role: 'system', content: SCHEMA_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Analyze this meal photo. Identify each distinct food or drink item, estimate its portion, calories, and macros. Ask a precise clarification question only when a portion or item is genuinely ambiguous.',
        },
        { type: 'image_url', image_url: { url: image } },
      ],
    },
  ]

  const upstream = await callFreellm(c.env, model, messages, 1200)
  if (!upstream.ok) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json({ error: 'upstream_error', message: upstream.message }, upstream.status)
  }

  const result = normalizeResult(extractJson(upstream.content), scanId, model)
  if (!result) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json(
      { error: 'invalid_model_output', message: "Couldn't read an estimate from that photo. Try another shot." },
      502,
    )
  }
  return c.json({ ...result, quota })
})

// ------------------------------------------------------------- text estimate

app.post('/api/fitness/scan/text', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ description?: unknown; timezone?: unknown }>().catch(() => null)
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  if (description.length < 2 || description.length > 500) {
    return c.json(
      { error: 'invalid_description', message: 'Describe the meal in 2–500 characters.' },
      400,
    )
  }
  if (!c.env.FREELLM_API_KEY) {
    return c.json({ error: 'upstream_error', message: 'AI meal estimates are not set up yet.' }, 503)
  }

  const date = await quotaDate(c.env, session.userId)
  const { quota, allowed } = await consumeScanQuota(c.env, session.userId, date)
  if (!allowed) {
    return c.json(
      {
        error: 'rate_limited',
        message: `You've used all ${SCANS_PER_DAY} AI meal estimates for today — try again tomorrow.`,
        quota,
      },
      429,
    )
  }

  const scanId = newId()
  const model = c.env.FREELLM_TEXT_MODEL ?? DEFAULT_TEXT_MODEL
  const messages = [
    { role: 'system', content: `${SCHEMA_PROMPT}\n${TEXT_ONLY_RULES}` },
    {
      role: 'user',
      content: `Meal description: ${description}\n\nIdentify the ingredients and dishes, estimate typical portions, and ask the user to fill in the missing quantities. Return the full JSON.`,
    },
  ]

  const upstream = await callFreellm(c.env, model, messages, 1200)
  if (!upstream.ok) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json({ error: 'upstream_error', message: upstream.message }, upstream.status)
  }

  const result = normalizeResult(extractJson(upstream.content), scanId, model, description)
  if (!result) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json(
      { error: 'invalid_model_output', message: "Couldn't turn that description into a meal. Try adding a few ingredients." },
      502,
    )
  }
  return c.json({ ...result, quota })
})

// ---------------------------------------------------------------- refine

app.post('/api/fitness/scan/refine', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req
    .json<{ scan?: unknown; instruction?: unknown; description?: unknown; timezone?: unknown }>()
    .catch(() => null)
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  if (!instruction && !description) {
    return c.json(
      { error: 'invalid_correction', message: 'Change the description or add a correction first.' },
      400,
    )
  }
  if (instruction.length > 500 || description.length > 500) {
    return c.json(
      { error: 'invalid_correction', message: 'Keep the correction under 500 characters.' },
      400,
    )
  }

  const scanId =
    body?.scan && typeof body.scan === 'object' && typeof (body.scan as { scan_id?: unknown }).scan_id === 'string'
      ? ((body.scan as { scan_id: string }).scan_id).slice(0, 64)
      : newId()
  const current = normalizeResult(body?.scan, scanId, '', description)
  if (!current || current.items.length === 0) {
    return c.json({ error: 'invalid_scan', message: 'The current estimate is missing or invalid.' }, 400)
  }
  if (!c.env.FREELLM_API_KEY) {
    return c.json({ error: 'upstream_error', message: 'AI meal estimates are not set up yet.' }, 503)
  }

  const date = await quotaDate(c.env, session.userId)
  const { quota, allowed } = await consumeScanQuota(c.env, session.userId, date)
  if (!allowed) {
    return c.json(
      {
        error: 'rate_limited',
        message: `You've used all ${SCANS_PER_DAY} AI meal estimates for today — try again tomorrow.`,
        quota,
      },
      429,
    )
  }

  const model = c.env.FREELLM_TEXT_MODEL ?? DEFAULT_TEXT_MODEL
  const systemPrompt = description
    ? `${SCHEMA_PROMPT}\n${TEXT_REBUILD_RULES}`
    : `${SCHEMA_PROMPT}\nYou are updating an existing estimate: apply the user's correction, keep every item they did not mention unchanged, and recompute totals.`
  const userPrompt = [
    `Current estimate JSON:\n${JSON.stringify({ description: current.description, items: current.items, totals: current.totals })}`,
    description ? `\nCorrected meal description: ${description}` : '',
    instruction ? `\nUser correction: ${instruction}` : '',
    '\nReturn the full updated JSON in the same schema.',
  ].join('')

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const upstream = await callFreellm(c.env, model, messages, 1200)
  if (!upstream.ok) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json({ error: 'upstream_error', message: upstream.message }, upstream.status)
  }

  const updated = normalizeResult(extractJson(upstream.content), scanId, model, description || current.description)
  if (!updated) {
    await refundScanQuota(c.env, session.userId, date)
    return c.json(
      { error: 'invalid_model_output', message: "Couldn't apply that correction. Try rephrasing it." },
      502,
    )
  }
  return c.json({ ...updated, quota })
})

// ------------------------------------------------------------- log scan

type LogScanEntry = {
  scan_id: string
  description?: string
  items: ScanItem[]
  totals: ScanTotals
  logged_at: number
}

type NutritionRow = {
  id: string
  activity: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  scan_data: string | null
  updated_at: number
}

function parseScans(raw: string | null): LogScanEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { scans?: unknown }
    if (!Array.isArray(parsed?.scans)) return []
    return parsed.scans.filter(
      (entry): entry is LogScanEntry =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as LogScanEntry).scan_id === 'string' &&
        typeof (entry as LogScanEntry).totals?.calories === 'number',
    )
  } catch {
    return []
  }
}

app.post('/api/fitness/log/scan', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req
    .json<{ scan_id?: unknown; description?: unknown; items?: unknown; timezone?: unknown }>()
    .catch(() => null)
  const items = normalizeItems(body?.items)
  if (items.length === 0) {
    return c.json({ error: 'invalid_items', message: 'Add at least one valid item before logging.' }, 400)
  }
  const totals = sumTotals(items)
  const description = cleanDescription(body?.description, items)
  const scanId =
    typeof body?.scan_id === 'string' && body.scan_id.trim() ? body.scan_id.trim().slice(0, 64) : newId()

  const timezone = await resolveTimezone(c.env, session.userId, timezoneHint(body?.timezone))
  const today = localDate(timezone)
  const now = Date.now()
  const entry: LogScanEntry = { scan_id: scanId, description, items, totals, logged_at: now }
  const itemNames = items.slice(0, 3).map((item) => item.name).join(', ')

  // A retry can cross local midnight, when "today's row" is a different row.
  // The ledger makes the scan id globally unique per user, not just per day.
  const duplicateResponse = async () => {
    const ledger = await c.env.DB.prepare(
      'SELECT log_id, recorded_at FROM fitness_scan_ledger WHERE user_id = ? AND scan_id = ?',
    )
      .bind(session.userId, scanId)
      .first<{ log_id: string; recorded_at: string }>()
    if (!ledger) return null
    const prior = await c.env.DB.prepare('SELECT calories FROM fitness_logs WHERE id = ?')
      .bind(ledger.log_id)
      .first<{ calories: number | null }>()
    return c.json({
      ok: true,
      duplicate: true,
      log_id: ledger.log_id,
      calories: prior?.calories ?? 0,
      date: ledger.recorded_at,
    })
  }
  {
    const duplicate = await duplicateResponse()
    if (duplicate) return duplicate
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await c.env.DB.prepare(
      "SELECT id, activity, calories, protein_g, carbs_g, fat_g, scan_data, updated_at FROM fitness_logs WHERE user_id = ? AND type = 'nutrition' AND recorded_at = ?",
    )
      .bind(session.userId, today)
      .first<NutritionRow>()

    const scans = parseScans(existing?.scan_data ?? null)
    if (existing && scans.some((stored) => stored.scan_id === scanId)) {
      return c.json({ ok: true, duplicate: true, log_id: existing.id, calories: existing.calories ?? 0 })
    }

    if (scans.length >= MAX_SCANS_STORED) {
      return c.json(
        {
          error: 'too_many_scans',
          message: "You've logged the maximum number of AI meals for today — add this one manually.",
        },
        429,
      )
    }

    const scansBefore = scans.length
    // Preserve calories that were not produced by scans (a manual nutrition
    // entry, or a manual edit to the row). The previous version only counted
    // them on the first scan and then silently dropped them on the next one.
    const storedScanCalories = scans.reduce((sum, stored) => sum + stored.totals.calories, 0)
    const baseCalories = existing ? Math.max(0, (existing.calories ?? 0) - storedScanCalories) : 0
    const nextScans = [...scans, entry]
    const calories = baseCalories + nextScans.reduce((sum, stored) => sum + stored.totals.calories, 0)
    const macroTotal = (key: 'protein_g' | 'carbs_g' | 'fat_g', rows: LogScanEntry[]) =>
      rows.reduce((sum, stored) => sum + stored.totals[key], 0)
    const baseProtein = Math.max(
      0,
      (existing?.protein_g ?? macroTotal('protein_g', scans)) - macroTotal('protein_g', scans),
    )
    const baseCarbs = Math.max(
      0,
      (existing?.carbs_g ?? macroTotal('carbs_g', scans)) - macroTotal('carbs_g', scans),
    )
    const baseFat = Math.max(
      0,
      (existing?.fat_g ?? macroTotal('fat_g', scans)) - macroTotal('fat_g', scans),
    )
    const protein = round1(baseProtein + macroTotal('protein_g', nextScans))
    const carbs = round1(baseCarbs + macroTotal('carbs_g', nextScans))
    const fat = round1(baseFat + macroTotal('fat_g', nextScans))
    const scanData = JSON.stringify({ source: 'scan', scans: nextScans })
    const computedActivity =
      scansBefore === 0
        ? `Meal: ${description || itemNames}${items.length > 3 ? ` +${items.length - 3} more` : ''}`
        : `${nextScans.length} meals today`
    const activity = existing?.activity?.trim() ? existing.activity : computedActivity

    const id = existing?.id ?? newId()
    const logStatement = existing
      ? c.env.DB.prepare(
          `UPDATE fitness_logs
           SET scan_data = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, activity = ?, updated_at = ?
           WHERE id = ? AND updated_at = ?`,
        ).bind(scanData, calories, protein, carbs, fat, activity, now, existing.id, existing.updated_at)
      : c.env.DB.prepare(
          `INSERT OR IGNORE INTO fitness_logs
             (id, user_id, type, recorded_at, activity, calories, protein_g, carbs_g, fat_g, scan_data, created_at, updated_at)
           VALUES (?, ?, 'nutrition', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          session.userId,
          today,
          activity,
          calories,
          protein,
          carbs,
          fat,
          scanData,
          now,
          now,
        )

    let result
    try {
      result = await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO fitness_scan_ledger (user_id, scan_id, log_id, recorded_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(session.userId, scanId, id, today, now),
        logStatement,
      ])
    } catch (err) {
      const duplicate = await duplicateResponse()
      if (duplicate) return duplicate
      console.error('[scan] ledger write failed', err)
      continue
    }
    if ((result[1]?.meta.changes ?? 0) === 0) {
      await c.env.DB.prepare('DELETE FROM fitness_scan_ledger WHERE user_id = ? AND scan_id = ?')
        .bind(session.userId, scanId)
        .run()
        .catch((err) => console.error('[scan] ledger cleanup failed', err))
      continue
    }

    await updateStreaks(c.env, session.userId, timezone).catch((err) => {
      console.error('[scan] updateStreaks failed', err)
    })
    return c.json({ ok: true, log_id: id, calories, scan_count: nextScans.length, date: today })
  }

  return c.json(
    { error: 'save_conflict', message: "Couldn't save that meal just now — please try again." },
    503,
  )
})

// ---------------------------------------------------------------- undo scan

app.post('/api/fitness/log/scan/undo', async (c) => {
  const session = await getSession(c.env.fitness_sessions, c.req.header('cookie') ?? null)
  if (!session) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json<{ scan_id?: unknown }>().catch(() => null)
  const scanId =
    typeof body?.scan_id === 'string' && body.scan_id.trim() ? body.scan_id.trim().slice(0, 64) : null
  if (!scanId) {
    return c.json({ error: 'invalid_scan', message: 'Which meal should be removed?' }, 400)
  }

  const now = Date.now()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = await c.env.DB.prepare(
      `SELECT id, activity, calories, scan_data, updated_at
         FROM fitness_logs
        WHERE user_id = ? AND type = 'nutrition' AND scan_data IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 20`,
    )
      .bind(session.userId)
      .all<NutritionRow>()

    let row: NutritionRow | undefined
    let scans: LogScanEntry[] = []
    for (const candidate of rows.results) {
      const parsed = parseScans(candidate.scan_data)
      if (parsed.some((entry) => entry.scan_id === scanId)) {
        row = candidate
        scans = parsed
        break
      }
    }
    if (!row) {
      return c.json({ error: 'not_found', message: 'That meal is no longer in today’s log.' }, 404)
    }

    const removed = scans.find((entry) => entry.scan_id === scanId)
    if (!removed) {
      return c.json({ error: 'not_found', message: 'That meal is no longer in today’s log.' }, 404)
    }
    const remaining = scans.filter((entry) => entry.scan_id !== scanId)
    const nextCalories = Math.max(0, (row.calories ?? 0) - removed.totals.calories)
    const currentProtein = row.protein_g ?? scans.reduce((sum, entry) => sum + entry.totals.protein_g, 0)
    const currentCarbs = row.carbs_g ?? scans.reduce((sum, entry) => sum + entry.totals.carbs_g, 0)
    const currentFat = row.fat_g ?? scans.reduce((sum, entry) => sum + entry.totals.fat_g, 0)
    const nextProtein = round1(Math.max(0, currentProtein - removed.totals.protein_g))
    const nextCarbs = round1(Math.max(0, currentCarbs - removed.totals.carbs_g))
    const nextFat = round1(Math.max(0, currentFat - removed.totals.fat_g))
    const scanGenerated =
      /^Meal: /.test(row.activity ?? '') || /^\d+ meals? today$/.test(row.activity ?? '')

    if (remaining.length === 0 && nextCalories === 0 && scanGenerated) {
      const deleted = await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM fitness_logs WHERE id = ? AND updated_at = ?').bind(
          row.id,
          row.updated_at,
        ),
        c.env.DB.prepare(
          `DELETE FROM fitness_scan_ledger
            WHERE user_id = ? AND scan_id = ?
              AND NOT EXISTS (SELECT 1 FROM fitness_logs WHERE id = ?)`,
        ).bind(session.userId, scanId, row.id),
      ])
      if ((deleted[0]?.meta.changes ?? 0) === 0) continue
      return c.json({
        ok: true,
        deleted: true,
        removed_calories: removed.totals.calories,
        calories: 0,
        scan_count: 0,
      })
    }

    let activity = row.activity
    if (scanGenerated) {
      if (remaining.length === 1) {
        const only = remaining[0]
        const names = only.items.slice(0, 3).map((item) => item.name).join(', ')
        activity = `Meal: ${only.description || names}${only.items.length > 3 ? ` +${only.items.length - 3} more` : ''}`
      } else if (remaining.length > 1) {
        activity = `${remaining.length} meals today`
      }
    }

    const updated = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE fitness_logs
         SET scan_data = ?, calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, activity = ?, updated_at = ?
         WHERE id = ? AND updated_at = ?`,
      ).bind(
        remaining.length > 0 ? JSON.stringify({ source: 'scan', scans: remaining }) : null,
        nextCalories,
        nextProtein,
        nextCarbs,
        nextFat,
        activity,
        now,
        row.id,
        row.updated_at,
      ),
      c.env.DB.prepare(
        `DELETE FROM fitness_scan_ledger
          WHERE user_id = ? AND scan_id = ?
            AND EXISTS (SELECT 1 FROM fitness_logs WHERE id = ? AND updated_at = ?)`,
      ).bind(session.userId, scanId, row.id, now),
    ])
    if ((updated[0]?.meta.changes ?? 0) === 0) continue

    return c.json({
      ok: true,
      deleted: false,
      removed_calories: removed.totals.calories,
      calories: nextCalories,
      scan_count: remaining.length,
    })
  }

  return c.json(
    { error: 'save_conflict', message: "Couldn't undo that meal just now — please try again." },
    503,
  )
})

export default app
