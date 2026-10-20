// Local verification: boots the real routes in Miniflare (workerd) with an
// in-process D1 + KV, seeds a user/session, and exercises every API endpoint.
// Run: node scripts/verify/run.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const FIXTURE_SQL = `
CREATE TABLE IF NOT EXISTS freellm_users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  avatar_url      TEXT,
  password_hash   TEXT,
  referral_code   TEXT NOT NULL UNIQUE,
  balance_credits INTEGER NOT NULL DEFAULT 0,
  role            TEXT NOT NULL DEFAULT 'user',
  tier            TEXT NOT NULL DEFAULT 'free',
  email_verified  INTEGER NOT NULL DEFAULT 0,
  referred_by     TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS freellm_auth_identities (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  provider       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  email          TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  UNIQUE (provider, subject)
);
CREATE TABLE IF NOT EXISTS freellm_referrals (
  id           TEXT PRIMARY KEY,
  referrer_id  TEXT NOT NULL,
  referred_id  TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'waiting',
  milestone    TEXT,
  reward       INTEGER,
  qualified_at INTEGER,
  paid_at      INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS freellm_email_blocks (
  id         TEXT PRIMARY KEY,
  pattern    TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
`

function splitStatements(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/\r$/, '').replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !/^PRAGMA\b/i.test(chunk))
}

let failures = 0
let checks = 0

function check(name, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok  ${name}`)
  } else {
    failures += 1
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const bundled = await build({
  entryPoints: [join(root, 'scripts', 'verify', 'worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  write: false,
})
const script = bundled.outputFiles[0].text

const timeBundled = await build({
  entryPoints: [join(root, 'functions', 'lib', 'time.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
})
const timeModule = await import(
  `data:text/javascript;base64,${Buffer.from(timeBundled.outputFiles[0].text).toString('base64')}`
)
const { localDate, addDays, weekStart, weekEnd, isValidTimezone, quotaDay } = timeModule

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script,
    compatibilityDate: '2026-05-03',
    d1Databases: { DB: 'verify-db' },
    kvNamespaces: ['fitness_sessions'],
    bindings: {
      ENVIRONMENT: 'test',
      PUBLIC_ORIGIN: 'http://localhost:8788',
      ADMIN_EMAIL: '',
      GOOGLE_CLIENT_ID: 'verify-client',
      GOOGLE_CLIENT_SECRET: 'verify-secret',
    },
    outboundService: async (request) => {
      if (request.url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'verify-access-token', expires_in: 3600 }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      if (request.url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        return new Response(
          JSON.stringify({
            sub: 'verify-google-sub',
            email: 'oauth@example.com',
            email_verified: true,
            name: 'OAuth User',
            picture: '',
          }),
          { headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('unexpected outbound request', { status: 500 })
    },
  }),
)

try {
  const db = await mf.getD1Database('DB')
  const kv = await mf.getKVNamespace('fitness_sessions')

  for (const stmt of splitStatements(FIXTURE_SQL)) {
    await db.prepare(stmt).run()
  }
  const migrationFiles = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    for (const stmt of splitStatements(readFileSync(join(root, 'migrations', file), 'utf8'))) {
      await db.prepare(stmt).run()
    }
  }

  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO freellm_users (id, email, username, display_name, referral_code, balance_credits, role, email_verified, created_at, updated_at)
       VALUES ('u-verify', 'verify@example.com', 'verifier', 'Verifier', 'VERIFY01', 0, 'admin', 1, ?, ?)`,
    )
    .bind(now, now)
    .run()

  await kv.put('session:verify-token', JSON.stringify({ userId: 'u-verify' }))
  const authHeaders = { cookie: 'fitness_session=verify-token', 'content-type': 'application/json' }

  const call = (path, opts = {}) => mf.dispatchFetch(`http://localhost${path}`, opts)
  const json = async (res) => {
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = { _raw: text }
    }
    return { status: res.status, body }
  }

  console.log('\n-- time helpers --')
  {
    check('UTC date stays on the UTC day', localDate('UTC', new Date('2026-01-01T00:30:00Z')) === '2026-01-01')
    check(
      'IST crosses midnight before UTC does',
      localDate('Asia/Kolkata', new Date('2026-01-01T20:00:00Z')) === '2026-01-02',
    )
    check(
      'UTC+14 (Kiritimati) is a day ahead',
      localDate('Pacific/Kiritimati', new Date('2026-01-01T10:00:00Z')) === '2026-01-02',
    )
    check(
      'UTC-11 (Pago Pago) is a day behind',
      localDate('Pacific/Pago_Pago', new Date('2026-01-01T10:00:00Z')) === '2025-12-31',
    )
    check(
      'DST spring forward keeps the local date',
      localDate('America/New_York', new Date('2026-03-09T03:30:00Z')) === '2026-03-08' &&
        localDate('America/New_York', new Date('2026-03-09T04:30:00Z')) === '2026-03-09',
    )
    check(
      'DST fall back keeps the local date',
      localDate('America/New_York', new Date('2026-11-02T04:30:00Z')) === '2026-11-01' &&
        localDate('America/New_York', new Date('2026-11-02T05:30:00Z')) === '2026-11-02',
    )
    check('invalid timezone falls back to UTC', localDate('Bogus/Zone', new Date('2026-01-01T00:30:00Z')) === '2026-01-01')
    check('addDays crosses month and year boundaries', addDays('2026-02-28', 1) === '2026-03-01' && addDays('2025-12-31', 1) === '2026-01-01')
    check(
      'week starts Monday and ends Sunday',
      weekStart('2026-10-19') === '2026-10-19' &&
        weekStart('2026-10-18') === '2026-10-12' &&
        weekEnd('2026-10-18') === '2026-10-18',
    )
    check(
      'timezone validation accepts IANA names and rejects junk',
      isValidTimezone('Asia/Kolkata') &&
        isValidTimezone('UTC') &&
        !isValidTimezone('Not/AZone') &&
        !isValidTimezone(''),
    )
    const quotaAt = new Date('2026-01-01T10:00:00Z')
    check(
      'quota day uses a confirmed timezone',
      quotaDay('user', 'Pacific/Kiritimati', quotaAt) === '2026-01-02',
    )
    check(
      'quota day ignores hints until the timezone is confirmed',
      quotaDay('auto', 'Pacific/Kiritimati', quotaAt) === '2026-01-01' &&
        quotaDay(null, 'Pacific/Kiritimati', quotaAt) === '2026-01-01' &&
        quotaDay('user', 'Not/AZone', quotaAt) === '2026-01-01',
    )
  }

  console.log('\n-- health & auth --')
  {
    const { status, body } = await json(await call('/api/health'))
    check('health 200 ok', status === 200 && body.ok === true && body.db === 'ok', JSON.stringify(body))
  }
  {
    const { status, body } = await json(await call('/api/me'))
    check('me without cookie -> user null', status === 200 && body.user === null)
  }
  {
    const { status, body } = await json(await call('/api/me', { headers: authHeaders }))
    check(
      'me with session -> public user, no password_hash',
      status === 200 && body.user?.username === 'verifier' && !('password_hash' in (body.user ?? {})),
      JSON.stringify(body),
    )
  }

  console.log('\n-- fitness logging --')
  {
    const { status, body } = await json(
      await call('/api/fitness/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'workout', activity: '30 min run', duration_min: 30, calories: 250 }),
      }),
    )
    check('log workout 200', status === 200 && body.log?.duration_min === 30, JSON.stringify(body))
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'workout', activity: 'duplicate' }),
      }),
    )
    check('duplicate workout -> 409 already_logged_today', status === 409 && body.error === 'already_logged_today')
  }
  {
    const { status } = await json(
      await call('/api/fitness/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'water', water_ml: 500 }),
      }),
    )
    check('log water 200', status === 200)
  }
  {
    const { status, body } = await json(await call('/api/fitness/log/today', { headers: authHeaders }))
    check('today -> 2 logs', status === 200 && body.logs?.length === 2, JSON.stringify(body).slice(0, 200))
  }
  {
    const { status, body } = await json(await call('/api/fitness/logs', { headers: authHeaders }))
    check('logs range 200 with rows', status === 200 && body.logs?.length >= 2)
  }
  {
    const today = localDate(null)
    await db
      .prepare(
        `INSERT OR IGNORE INTO fitness_logs (id, user_id, type, recorded_at, activity, created_at, updated_at)
         VALUES ('log-welcome', 'u-verify', 'custom', ?, 'Welcome to fitness.hasit.in', ?, ?)`,
      )
      .bind(today, now, now)
      .run()
    const { status, body } = await json(
      await call('/api/fitness/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'custom', activity: 'Stretch test' }),
      }),
    )
    check(
      'signup welcome row does not consume the custom slot',
      status === 200 && body.log?.type === 'custom' && body.log?.activity === 'Stretch test',
      JSON.stringify(body),
    )
    await db
      .prepare(
        "DELETE FROM fitness_logs WHERE user_id = 'u-verify' AND activity IN ('Welcome to fitness.hasit.in', 'Stretch test')",
      )
      .run()
  }

  console.log('\n-- macros & corrections --')
  {
    const today = localDate(null)
    const yesterday = addDays(today, -1)

    const savedTargets = await json(
      await call('/api/fitness/targets', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          calorie_target: 2200,
          protein_target_g: 150,
          carbs_target_g: 240,
          fat_target_g: 70,
        }),
      }),
    )
    check(
      'macro targets save',
      savedTargets.status === 200 && savedTargets.body.targets?.protein_target_g === 150,
      JSON.stringify(savedTargets.body),
    )

    const readTargets = await json(
      await call('/api/fitness/targets', { headers: authHeaders }),
    )
    check(
      'macro targets read back',
      readTargets.status === 200 &&
        readTargets.body.targets?.calorie_target === 2200 &&
        readTargets.body.targets?.fat_target_g === 70,
      JSON.stringify(readTargets.body),
    )

    const todayWithTargets = await json(
      await call('/api/fitness/log/today', { headers: authHeaders }),
    )
    check(
      'today response includes macro targets',
      todayWithTargets.status === 200 &&
        todayWithTargets.body.targets?.carbs_target_g === 240,
      JSON.stringify(todayWithTargets.body).slice(0, 250),
    )

    const created = await json(
      await call('/api/fitness/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          type: 'nutrition',
          activity: 'Dal and rice',
          calories: 500,
          protein_g: 22.5,
          carbs_g: 70,
          fat_g: 9,
          date: yesterday,
        }),
      }),
    )
    const createdId = created.body.log?.id
    check(
      'nutrition log accepts yesterday + macros',
      created.status === 200 &&
        created.body.date === yesterday &&
        created.body.log?.recorded_at === yesterday &&
        created.body.log?.protein_g === 22.5,
      JSON.stringify(created.body).slice(0, 300),
    )

    const patched = await json(
      await call(`/api/fitness/log/${createdId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          activity: 'Dal, rice, curd',
          calories: 550,
          protein_g: 25,
          fat_g: 10,
        }),
      }),
    )
    check(
      'log edit updates calories and macros',
      patched.status === 200 &&
        patched.body.log?.calories === 550 &&
        patched.body.log?.protein_g === 25 &&
        patched.body.log?.activity === 'Dal, rice, curd',
      JSON.stringify(patched.body).slice(0, 300),
    )

    const futureEdit = await json(
      await call(`/api/fitness/log/${createdId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ recorded_at: addDays(today, 1) }),
      }),
    )
    check(
      'log edit rejects a future date',
      futureEdit.status === 400 && futureEdit.body.error === 'invalid_date',
      JSON.stringify(futureEdit.body),
    )

    const deleted = await json(
      await call(`/api/fitness/log/${createdId}`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
    )
    const gone = await db
      .prepare('SELECT COUNT(*) AS c FROM fitness_logs WHERE id = ?')
      .bind(createdId)
      .first()
    check(
      'log delete removes the row',
      deleted.status === 200 && deleted.body.deleted === true && gone?.c === 0,
      JSON.stringify({ response: deleted.body, gone }),
    )
  }

  console.log('\n-- streaks & badges --')
  {
    const { status, body } = await json(await call('/api/fitness/streaks', { headers: authHeaders }))
    check(
      'streaks -> current 1 (first-ever log exercises insert path)',
      status === 200 && body.streaks?.current_streak === 1 && body.streaks?.longest_streak === 1,
      JSON.stringify(body),
    )
  }
  {
    const { status, body } = await json(await call('/api/fitness/badges', { headers: authHeaders }))
    const codes = (body.badges ?? []).map((b) => b.badge_code)
    check('badges -> first_log awarded, joined with catalog', status === 200 && codes.includes('first_log'), JSON.stringify(body))
    check('badge catalog fields present', (body.badges ?? []).every((b) => b.name && b.icon))
  }

  console.log('\n-- goals --')
  {
    const { status, body } = await json(
      await call('/api/fitness/goals', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ type: 'workout', target: 150, period: 'week' }),
      }),
    )
    check('goal create 200', status === 200 && body.goal?.target === 150, JSON.stringify(body))
  }
  {
    const { status, body } = await json(await call('/api/fitness/goals', { headers: authHeaders }))
    check('goals list has 1', status === 200 && body.goals?.length === 1)
  }
  {
    // A caller-supplied id must never let another user replace this goal.
    const existing = await db
      .prepare("SELECT id, target FROM fitness_goals WHERE user_id = 'u-verify'")
      .first()
    await db
      .prepare(
        `INSERT INTO freellm_users (id, email, username, display_name, referral_code, balance_credits, role, email_verified, created_at, updated_at)
         VALUES ('u-other', 'other@example.com', 'other', 'Other', 'OTHER001', 0, 'user', 1, ?, ?)`,
      )
      .bind(now, now)
      .run()
    await kv.put('session:other-token', JSON.stringify({ userId: 'u-other' }))
    const otherHeaders = { cookie: 'fitness_session=other-token', 'content-type': 'application/json' }
    const { status, body } = await json(
      await call('/api/fitness/goals', {
        method: 'POST',
        headers: otherHeaders,
        body: JSON.stringify({ id: existing?.id, type: 'workout', target: 999, period: 'day' }),
      }),
    )
    const unchanged = await db
      .prepare("SELECT target FROM fitness_goals WHERE id = ? AND user_id = 'u-verify'")
      .bind(existing?.id)
      .first()
    check(
      'goal id from another user -> 404 and unchanged',
      status === 404 && unchanged?.target === 150,
      JSON.stringify({ status, body, unchanged }),
    )
  }

  console.log('\n-- leaderboard --')
  {
    const { status, body } = await json(await call('/api/fitness/leaderboard'))
    const row = (body.leaderboard ?? []).find((r) => r.id === 'u-verify')
    check('leaderboard includes user with workout minutes', status === 200 && row?.workout_minutes === 30, JSON.stringify(body))
  }

  console.log('\n-- timezone --')
  const tz = 'Asia/Kolkata'
  const zoneParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const zonePart = (type) => zoneParts.find((part) => part.type === type)?.value
  const tzLocalDate = `${zonePart('year')}-${zonePart('month')}-${zonePart('day')}`
  {
    const { status, body } = await json(await call(`/api/fitness/profile?tz=${encodeURIComponent(tz)}`, { headers: authHeaders }))
    check(
      'profile detects timezone (unconfirmed)',
      status === 200 && body.timezone === tz && body.confirmed === false,
      JSON.stringify(body),
    )
  }
  {
    const { status, body } = await json(await call(`/api/fitness/log/today?tz=${encodeURIComponent(tz)}`, { headers: authHeaders }))
    check(
      'today uses local date for profile timezone',
      status === 200 && body.date === tzLocalDate && body.timezone === tz,
      JSON.stringify(body).slice(0, 200),
    )
  }
  {
    const { status } = await json(
      await call('/api/fitness/profile', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ timezone: 'Not/AZone' }),
      }),
    )
    check('profile rejects invalid timezone -> 400', status === 400)
  }
  const backfillCreatedAt = Date.UTC(2026, 0, 1, 20, 0, 0)
  await db
    .prepare(
      `INSERT INTO fitness_logs (id, user_id, type, recorded_at, activity, calories, note, created_at, updated_at)
       VALUES ('log-backfill', 'u-verify', 'custom', '2026-01-01', 'Old UTC entry', NULL, 'utc note', ?, ?)`,
    )
    .bind(backfillCreatedAt, backfillCreatedAt)
    .run()
  const mergeCreatedAt = Date.UTC(2026, 0, 2, 1, 0, 0)
  await db
    .prepare(
      `INSERT INTO fitness_logs (id, user_id, type, recorded_at, activity, calories, note, created_at, updated_at)
       VALUES ('log-merge-target', 'u-verify', 'custom', '2026-01-02', 'Local entry', 100, 'local note', ?, ?)`,
    )
    .bind(mergeCreatedAt, mergeCreatedAt)
    .run()
  await db
    .prepare(
      `INSERT INTO fitness_scan_usage (user_id, date, count, updated_at) VALUES
       ('u-verify', '2026-01-01', 3, ?),
       ('u-verify', '2026-01-02', 2, ?)`,
    )
    .bind(Date.UTC(2026, 0, 1, 20, 0, 0), Date.UTC(2026, 0, 2, 10, 0, 0))
    .run()
  {
    const { status, body } = await json(
      await call('/api/fitness/profile', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ timezone: tz }),
      }),
    )
    check('profile saves confirmed timezone', status === 200 && body.timezone === tz && body.confirmed === true, JSON.stringify(body))
    check('first confirmation reports backfilled rows', body.backfilled >= 1, JSON.stringify(body))
  }
  {
    const moved = await db
      .prepare("SELECT recorded_at FROM fitness_logs WHERE id = 'log-merge-target'")
      .first()
    check(
      'first confirmation re-dates prior logs in the chosen timezone',
      moved?.recorded_at === '2026-01-02',
      JSON.stringify(moved),
    )
  }
  {
    const rows = await db
      .prepare(
        "SELECT id, activity, calories, note FROM fitness_logs WHERE user_id = 'u-verify' AND recorded_at = '2026-01-02' AND type = 'custom'",
      )
      .all()
    check(
      'colliding backfill rows merge instead of being dropped',
      rows.results?.length === 1 &&
        rows.results[0].calories === 100 &&
        rows.results[0].activity.includes('Old UTC entry') &&
        rows.results[0].activity.includes('Local entry') &&
        rows.results[0].note.includes('utc note'),
      JSON.stringify(rows.results),
    )
  }
  {
    const usage = await db
      .prepare("SELECT date, count FROM fitness_scan_usage WHERE user_id = 'u-verify'")
      .all()
    check(
      'scan quota rows are re-dated and merged after confirmation',
      usage.results?.length === 1 &&
        usage.results[0].date === '2026-01-02' &&
        usage.results[0].count === 5,
      JSON.stringify(usage.results),
    )
  }
  {
    const { status, body } = await json(await call('/api/fitness/profile', { headers: authHeaders }))
    check('profile stays confirmed', status === 200 && body.confirmed === true && body.timezone === tz, JSON.stringify(body))
  }
  {
    await db
      .prepare(
        `INSERT INTO freellm_users (id, email, username, display_name, referral_code, balance_credits, role, email_verified, created_at, updated_at)
         VALUES ('u-retz', 'retz@example.com', 'retz', 'Retz', 'RETZ0001', 0, 'user', 1, ?, ?)`,
      )
      .bind(now, now)
      .run()
    await kv.put('session:retz-token', JSON.stringify({ userId: 'u-retz' }))
    const retzHeaders = { cookie: 'fitness_session=retz-token', 'content-type': 'application/json' }
    const createdAt = Date.UTC(2026, 0, 1, 20, 0, 0)
    await db
      .prepare(
        `INSERT INTO fitness_logs (id, user_id, type, recorded_at, activity, created_at, updated_at)
         VALUES ('log-retz', 'u-retz', 'custom', '2026-01-01', 'Retz entry', ?, ?)`,
      )
      .bind(createdAt, createdAt)
      .run()

    const first = await json(
      await call('/api/fitness/profile', {
        method: 'PUT',
        headers: retzHeaders,
        body: JSON.stringify({ timezone: tz }),
      }),
    )
    check(
      'timezone change re-dates on first confirmation',
      first.status === 200 && first.body.backfilled >= 1,
      JSON.stringify(first.body),
    )

    const second = await json(
      await call('/api/fitness/profile', {
        method: 'PUT',
        headers: retzHeaders,
        body: JSON.stringify({ timezone: 'UTC' }),
      }),
    )
    const moved = await db
      .prepare("SELECT recorded_at FROM fitness_logs WHERE id = 'log-retz'")
      .first()
    check(
      'a later timezone change leaves past days where they were logged',
      second.status === 200 &&
        second.body.backfilled === 0 &&
        moved?.recorded_at === '2026-01-02',
      JSON.stringify({ body: second.body, moved }),
    )
  }

  console.log('\n-- oauth state & session cookie --')
  {
    const start = await mf.dispatchFetch('http://localhost/api/auth/google', { redirect: 'manual' })
    const startCookie = start.headers.get('set-cookie') ?? ''
    const location = start.headers.get('location') ?? ''
    const state = new URL(location).searchParams.get('state') ?? ''
    const nonce = /fitness_oauth=([^;]+)/.exec(startCookie)?.[1] ?? ''
    check(
      'oauth start binds a nonce to a Secure, HttpOnly, Lax cookie',
      start.status === 302 &&
        state.length > 0 &&
        nonce.length > 0 &&
        /HttpOnly/.test(startCookie) &&
        /Secure/.test(startCookie) &&
        /SameSite=Lax/.test(startCookie),
      JSON.stringify({ status: start.status, state, nonce, startCookie }),
    )

    const mismatch = await json(
      await call(`/api/auth/google/callback?code=test&state=${encodeURIComponent(state)}`, {
        headers: { cookie: 'fitness_oauth=wrong-nonce' },
      }),
    )
    check(
      'a callback with the wrong browser nonce is rejected',
      mismatch.status === 400,
      JSON.stringify(mismatch.body),
    )

    const callback = await mf.dispatchFetch(
      `http://localhost/api/auth/google/callback?code=test&state=${encodeURIComponent(state)}`,
      { redirect: 'manual', headers: { cookie: `fitness_oauth=${nonce}` } },
    )
    const callbackCookies = callback.headers.get('set-cookie') ?? ''
    const sessionCookie = /fitness_session=[^;]+/.exec(callbackCookies)?.[0] ?? ''
    check(
      'the correct nonce completes sign-in and sets a Secure session',
      callback.status === 302 &&
        callback.headers.get('location') === 'http://localhost:8788/dashboard' &&
        /fitness_session=[^;]+/.test(callbackCookies) &&
        /Secure/.test(callbackCookies) &&
        /HttpOnly/.test(callbackCookies) &&
        /SameSite=Lax/.test(callbackCookies) &&
        /fitness_oauth=;.*Max-Age=0/.test(callbackCookies),
      JSON.stringify({ status: callback.status, cookies: callbackCookies }),
    )

    const me = await json(await call('/api/me', { headers: { cookie: sessionCookie } }))
    check(
      'the OAuth session identifies the signed-in user',
      me.status === 200 && me.body.user?.email === 'oauth@example.com',
      JSON.stringify(me.body),
    )

    const replay = await json(
      await call(`/api/auth/google/callback?code=test&state=${encodeURIComponent(state)}`, {
        headers: { cookie: `fitness_oauth=${nonce}` },
      }),
    )
    check('a consumed OAuth state cannot be replayed', replay.status === 400)
  }

  console.log('\n-- photo scan --')
  {
    const { status } = await json(await call('/api/fitness/scan', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }))
    check('scan without cookie -> 401', status === 401)
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/scan', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ image: 'not-a-data-uri' }),
      }),
    )
    check('scan rejects invalid image -> 400', status === 400 && body.error === 'invalid_image', JSON.stringify(body))
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/scan', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA' }),
      }),
    )
    check('scan without API key -> 503 configured error', status === 503 && body.error === 'upstream_error', JSON.stringify(body))
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/scan/text', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ description: 'x' }),
      }),
    )
    check('text estimate rejects too-short description -> 400', status === 400 && body.error === 'invalid_description', JSON.stringify(body))
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/scan/text', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ description: 'rice and dal' }),
      }),
    )
    check('text estimate without API key -> 503', status === 503 && body.error === 'upstream_error', JSON.stringify(body))
  }
  const scanId = 'scan-verify-1'
  const scanItems = [
    { name: 'Toast', qty: 2, unit: 'slices', calories: 150, protein_g: 4, fat_g: 2, carbs_g: 28, confidence: 0.9 },
    { name: 'Egg', qty: 2, unit: 'pieces', calories: 140, protein_g: 12, fat_g: 10, carbs_g: 1, confidence: 0.8 },
  ]
  {
    const { status, body } = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ scan_id: scanId, items: scanItems, totals: { calories: 99999 } }),
      }),
    )
    check(
      'log scan stores server-computed calories',
      status === 200 && body.calories === 290 && body.scan_count === 1,
      JSON.stringify(body),
    )
  }
  {
    const { status, body } = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ scan_id: scanId, items: scanItems }),
      }),
    )
    check('log scan is idempotent per scan_id', status === 200 && body.duplicate === true && body.calories === 290, JSON.stringify(body))
  }
  {
    const stored = await db
      .prepare("SELECT scan_data, note FROM fitness_logs WHERE user_id = 'u-verify' AND type = 'nutrition'")
      .first()
    let parsed = null
    try {
      parsed = stored?.scan_data ? JSON.parse(stored.scan_data) : null
    } catch {
      parsed = null
    }
    const toast = parsed?.scans?.[0]?.items?.[0]
    check(
      'log scan stores ranges in scan_data (not note)',
      toast?.calories === 150 && toast?.calories_low === 120 && toast?.calories_high === 180 && stored?.note == null,
      JSON.stringify({ toast, note: stored?.note }),
    )
  }
  {
    const { status, body } = await json(await call(`/api/fitness/log/today?tz=${encodeURIComponent(tz)}`, { headers: authHeaders }))
    const nutrition = (body.logs ?? []).find((log) => log.type === 'nutrition')
    check(
      'scanned meal appears in today logs with macros',
      status === 200 &&
        nutrition?.calories === 290 &&
        nutrition?.protein_g === 16 &&
        nutrition?.carbs_g === 29 &&
        nutrition?.fat_g === 12 &&
        body.date === tzLocalDate,
      JSON.stringify(body).slice(0, 300),
    )
  }
  {
    const { status, body } = await json(await call('/api/fitness/log/scan', { method: 'POST', headers: authHeaders, body: JSON.stringify({ items: [] }) }))
    check('log scan rejects empty items -> 400', status === 400 && body.error === 'invalid_items')
  }

  console.log('\n-- scan merge math --')
  {
    const mergeDate = localDate(null)
    await db
      .prepare(
        `INSERT INTO freellm_users (id, email, username, display_name, referral_code, balance_credits, role, email_verified, created_at, updated_at)
         VALUES ('u-merge', 'merge@example.com', 'merge', 'Merge', 'MERGE001', 0, 'user', 1, ?, ?)`,
      )
      .bind(now, now)
      .run()
    await kv.put('session:merge-token', JSON.stringify({ userId: 'u-merge' }))
    const mergeHeaders = { cookie: 'fitness_session=merge-token', 'content-type': 'application/json' }
    await db
      .prepare(
        `INSERT INTO fitness_logs (id, user_id, type, recorded_at, activity, calories, created_at, updated_at)
         VALUES ('manual-merge', 'u-merge', 'nutrition', ?, 'Manual entry', 600, ?, ?)`,
      )
      .bind(mergeDate, now, now)
      .run()

    const first = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({
          scan_id: 'merge-1',
          timezone: 'UTC',
          items: [{ name: 'Rice', qty: 1, unit: 'bowl', calories: 300, protein_g: 6, fat_g: 2, carbs_g: 60 }],
        }),
      }),
    )
    check(
      'first scan preserves manual calories (600 + 300 = 900)',
      first.status === 200 && first.body.calories === 900,
      JSON.stringify(first.body),
    )

    const second = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({
          scan_id: 'merge-2',
          timezone: 'UTC',
          items: [{ name: 'Dal', qty: 1, unit: 'bowl', calories: 200, protein_g: 10, fat_g: 4, carbs_g: 30 }],
        }),
      }),
    )
    check(
      'second scan preserves manual calories (600 + 300 + 200 = 1100)',
      second.status === 200 && second.body.calories === 1100,
      JSON.stringify(second.body),
    )

    const quotaBefore = await json(await call('/api/fitness/scan/quota', { headers: mergeHeaders }))
    check(
      'quota can be read before spending an estimate',
      quotaBefore.status === 200 &&
        quotaBefore.body.quota?.used === 0 &&
        quotaBefore.body.quota?.limit === 20 &&
        quotaBefore.body.configured === false,
      JSON.stringify(quotaBefore.body),
    )

    const undoSecond = await json(
      await call('/api/fitness/log/scan/undo', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({ scan_id: 'merge-2' }),
      }),
    )
    check(
      'undo removes only the chosen scan (1100 - 200 = 900)',
      undoSecond.status === 200 &&
        undoSecond.body.calories === 900 &&
        undoSecond.body.scan_count === 1 &&
        undoSecond.body.deleted === false,
      JSON.stringify(undoSecond.body),
    )

    const undoFirst = await json(
      await call('/api/fitness/log/scan/undo', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({ scan_id: 'merge-1' }),
      }),
    )
    check(
      'undoing the last scan keeps the manual entry (600 kcal left)',
      undoFirst.status === 200 &&
        undoFirst.body.calories === 600 &&
        undoFirst.body.scan_count === 0 &&
        undoFirst.body.deleted === false,
      JSON.stringify(undoFirst.body),
    )

    const undoAgain = await json(
      await call('/api/fitness/log/scan/undo', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({ scan_id: 'merge-1' }),
      }),
    )
    check('undoing a missing scan -> 404', undoAgain.status === 404)

    const midnightLog = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({
          scan_id: 'merge-midnight',
          timezone: 'UTC',
          items: [{ name: 'Idli', qty: 1, unit: 'plate', calories: 300, protein_g: 8, fat_g: 4, carbs_g: 50 }],
        }),
      }),
    )
    check(
      'pre-midnight scan logs normally',
      midnightLog.status === 200 && midnightLog.body.calories === 900,
      JSON.stringify(midnightLog.body),
    )
    const yesterday = addDays(mergeDate, -1)
    await db.batch([
      db
        .prepare('UPDATE fitness_logs SET recorded_at = ? WHERE id = ?')
        .bind(yesterday, midnightLog.body.log_id),
      db
        .prepare(
          'UPDATE fitness_scan_ledger SET recorded_at = ? WHERE user_id = ? AND scan_id = ?',
        )
        .bind(yesterday, 'u-merge', 'merge-midnight'),
    ])
    const retryAfterMidnight = await json(
      await call('/api/fitness/log/scan', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({
          scan_id: 'merge-midnight',
          timezone: 'UTC',
          items: [{ name: 'Idli', qty: 1, unit: 'plate', calories: 300, protein_g: 8, fat_g: 4, carbs_g: 50 }],
        }),
      }),
    )
    check(
      'a scan retried after midnight is a duplicate, not a second meal',
      retryAfterMidnight.status === 200 &&
        retryAfterMidnight.body.duplicate === true &&
        retryAfterMidnight.body.log_id === midnightLog.body.log_id &&
        retryAfterMidnight.body.date === yesterday,
      JSON.stringify(retryAfterMidnight.body),
    )
    const storedMidnight = await db
      .prepare("SELECT COUNT(*) AS c FROM fitness_logs WHERE user_id = 'u-merge' AND scan_data LIKE '%merge-midnight%'")
      .first()
    check('the cross-midnight retry stored only one scan entry', storedMidnight?.c === 1, JSON.stringify(storedMidnight))

    const undoMidnight = await json(
      await call('/api/fitness/log/scan/undo', {
        method: 'POST',
        headers: mergeHeaders,
        body: JSON.stringify({ scan_id: 'merge-midnight' }),
      }),
    )
    const ledgerAfterUndo = await db
      .prepare("SELECT COUNT(*) AS c FROM fitness_scan_ledger WHERE user_id = 'u-merge' AND scan_id = 'merge-midnight'")
      .first()
    check(
      'undo clears the scan ledger so a corrected re-log is allowed',
      undoMidnight.status === 200 &&
        undoMidnight.body.calories === 600 &&
        ledgerAfterUndo?.c === 0,
      JSON.stringify({ undo: undoMidnight.body, ledger: ledgerAfterUndo }),
    )

    const usage = await db
      .prepare("SELECT COUNT(*) AS rows FROM fitness_scan_usage WHERE user_id = 'u-merge'")
      .first()
    check(
      'scan quota is not spent when the gateway is unconfigured',
      usage?.rows === 0,
      JSON.stringify(usage),
    )
  }

  console.log('\n-- mocked upstream scans --')
  {
    const scenarios = []
    const upstreamCalls = []
    const completion = (payload) => ({
      choices: [
        {
          message: {
            content: typeof payload === 'string' ? payload : JSON.stringify(payload),
          },
        },
      ],
    })
    const item = (name, calories, extra = {}) => ({
      name,
      qty: 1,
      unit: 'bowl',
      calories,
      calories_low: Math.round(calories * 0.8),
      calories_high: Math.round(calories * 1.2),
      protein_g: 6,
      fat_g: 2,
      carbs_g: 40,
      confidence: 0.9,
      ...extra,
    })

    const scanMf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script,
        compatibilityDate: '2026-05-03',
        d1Databases: { DB: 'verify-scan-db' },
        kvNamespaces: ['fitness_sessions'],
        bindings: {
          ENVIRONMENT: 'test',
          PUBLIC_ORIGIN: 'http://localhost:8788',
          ADMIN_EMAIL: '',
          FREELLM_API_KEY: 'fl_test_scan',
          FREELLM_BASE_URL: 'https://freellm.test/v1',
        },
        outboundService: async (request) => {
          const raw = await request.text()
          upstreamCalls.push({
            url: request.url,
            authorization: request.headers.get('authorization'),
            body: raw ? JSON.parse(raw) : null,
          })
          const next = scenarios.shift()
          if (!next) return new Response('unexpected upstream call', { status: 500 })
          return new Response(
            typeof next.body === 'string' ? next.body : JSON.stringify(next.body),
            { status: next.status ?? 200, headers: { 'content-type': 'application/json' } },
          )
        },
      }),
    )

    try {
      const scanDb = await scanMf.getD1Database('DB')
      const scanKv = await scanMf.getKVNamespace('fitness_sessions')
      for (const stmt of splitStatements(FIXTURE_SQL)) await scanDb.prepare(stmt).run()
      for (const file of readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
        for (const stmt of splitStatements(readFileSync(join(root, 'migrations', file), 'utf8'))) {
          await scanDb.prepare(stmt).run()
        }
      }
      await scanDb
        .prepare(
          `INSERT INTO freellm_users (id, email, username, display_name, referral_code, balance_credits, role, email_verified, created_at, updated_at)
           VALUES ('u-scan', 'scan@example.com', 'scanner', 'Scanner', 'SCAN0001', 0, 'user', 1, ?, ?)`,
        )
        .bind(now, now)
        .run()
      await scanKv.put('session:scan-token', JSON.stringify({ userId: 'u-scan' }))
      const scanHeaders = { cookie: 'fitness_session=scan-token', 'content-type': 'application/json' }
      const callScan = (path, opts = {}) => scanMf.dispatchFetch(`http://localhost${path}`, opts)

      const initialQuota = await json(await callScan('/api/fitness/scan/quota', { headers: scanHeaders }))
      check(
        'quota reports the mock gateway as configured before spending',
        initialQuota.status === 200 &&
          initialQuota.body.quota?.used === 0 &&
          initialQuota.body.configured === true,
        JSON.stringify(initialQuota.body),
      )

      scenarios.push({
        body: completion({
          description: 'Rice bowl',
          items: [item('Rice', 300)],
          needs_clarification: false,
          questions: [],
        }),
      })
      const photo = await json(
        await callScan('/api/fitness/scan', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA' }),
        }),
      )
      check(
        'photo scan returns server-measured items and spends one estimate',
        photo.status === 200 &&
          photo.body.totals?.calories === 300 &&
          typeof photo.body.scan_id === 'string' &&
          photo.body.quota?.used === 1,
        JSON.stringify(photo.body),
      )
      const photoCall = upstreamCalls[0]
      check(
        'photo scan calls the vision model through freellm with the server key',
        photoCall?.url === 'https://freellm.test/v1/chat/completions' &&
          photoCall?.authorization === 'Bearer fl_test_scan' &&
          photoCall?.body?.model === 'nemotron-3-5-super-vl' &&
          Array.isArray(photoCall?.body?.messages?.[1]?.content),
        JSON.stringify({ url: photoCall?.url, model: photoCall?.body?.model }),
      )

      scenarios.push({
        body: completion({
          description: 'Rice bowl with dal',
          items: [item('Rice', 300), item('Dal', 200)],
          needs_clarification: false,
          questions: [],
        }),
      })
      const refined = await json(
        await callScan('/api/fitness/scan/refine', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ scan: photo.body, instruction: 'add dal' }),
        }),
      )
      check(
        'refine rebuilds totals and reuses the scan id',
        refined.status === 200 &&
          refined.body.totals?.calories === 500 &&
          refined.body.scan_id === photo.body.scan_id &&
          refined.body.quota?.used === 2,
        JSON.stringify(refined.body),
      )
      check(
        'refine calls the text model without images',
        upstreamCalls[1]?.body?.model === 'nemotron-3-ultra-550b-a55b' &&
          typeof upstreamCalls[1]?.body?.messages?.[1]?.content === 'string',
        JSON.stringify(upstreamCalls[1]?.body?.model),
      )

      scenarios.push({
        body: completion({
          description: 'Dal',
          items: [item('Dal', 200)],
          needs_clarification: true,
          questions: [{ item_name: 'Dal', question: 'How large was the bowl?' }],
        }),
      })
      const text = await json(
        await callScan('/api/fitness/scan/text', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ description: 'a bowl of dal' }),
        }),
      )
      check(
        'text estimate keeps clarification questions and spends one estimate',
        text.status === 200 &&
          text.body.totals?.calories === 200 &&
          text.body.needs_clarification === true &&
          text.body.questions?.length === 1 &&
          text.body.quota?.used === 3,
        JSON.stringify(text.body),
      )

      scenarios.push({ body: completion('this is not json') })
      const invalid = await json(
        await callScan('/api/fitness/scan/text', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ description: 'another bowl of dal' }),
        }),
      )
      const afterInvalid = await json(await callScan('/api/fitness/scan/quota', { headers: scanHeaders }))
      check(
        'invalid model output fails closed and refunds the estimate',
        invalid.status === 502 &&
          invalid.body.error === 'invalid_model_output' &&
          afterInvalid.body.quota?.used === 3,
        JSON.stringify({ invalid: invalid.body, quota: afterInvalid.body }),
      )

      scenarios.push({ status: 429, body: { error: 'rate_limited' } })
      const busy = await json(
        await callScan('/api/fitness/scan/text', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ description: 'yet another bowl of dal' }),
        }),
      )
      const afterBusy = await json(await callScan('/api/fitness/scan/quota', { headers: scanHeaders }))
      check(
        'upstream 429 becomes human copy and refunds the estimate',
        busy.status === 429 &&
          busy.body.error === 'upstream_error' &&
          /try again/i.test(busy.body.message ?? '') &&
          afterBusy.body.quota?.used === 3,
        JSON.stringify({ busy: busy.body, quota: afterBusy.body }),
      )

      const logged = await json(
        await callScan('/api/fitness/log/scan', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ scan_id: refined.body.scan_id, items: refined.body.items }),
        }),
      )
      check(
        'a mocked scan can be logged end to end',
        logged.status === 200 && logged.body.calories === 500 && logged.body.scan_count === 1,
        JSON.stringify(logged.body),
      )
      const undone = await json(
        await callScan('/api/fitness/log/scan/undo', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ scan_id: refined.body.scan_id }),
        }),
      )
      check(
        'undo deletes a scan-only meal after the round trip',
        undone.status === 200 && undone.body.deleted === true && undone.body.scan_count === 0,
        JSON.stringify(undone.body),
      )

      await scanDb
        .prepare(
          `INSERT INTO fitness_scan_usage (user_id, date, count, updated_at)
           VALUES ('u-scan', ?, 20, ?)
           ON CONFLICT(user_id, date) DO UPDATE SET count = 20, updated_at = excluded.updated_at`,
        )
        .bind(localDate(null), now)
        .run()
      const callsBeforeLimit = upstreamCalls.length
      const atLimit = await json(await callScan('/api/fitness/scan/quota', { headers: scanHeaders }))
      const blocked = await json(
        await callScan('/api/fitness/scan', {
          method: 'POST',
          headers: scanHeaders,
          body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA' }),
        }),
      )
      check(
        'the daily ceiling blocks before any upstream call',
        atLimit.body.quota?.used === 20 &&
          atLimit.body.remaining === 0 &&
          blocked.status === 429 &&
          blocked.body.error === 'rate_limited' &&
          upstreamCalls.length === callsBeforeLimit,
        JSON.stringify({ quota: atLimit.body, blocked: blocked.body }),
      )
    } finally {
      await scanMf.dispose()
    }
  }

  console.log('\n-- habits --')
  {
    const before = await json(await call('/api/fitness/habits', { headers: authHeaders }))
    const beforeToday = before.body.days?.[before.body.days.length - 1]
    check(
      'habits return a 7-day rollup including today',
      before.status === 200 &&
        before.body.days?.length === 7 &&
        beforeToday?.date === localDate(null) &&
        before.body.targets?.protein_g === 150,
      JSON.stringify(before.body).slice(0, 300),
    )

    const waterBefore = beforeToday?.water_ml ?? 0
    const water = await json(
      await call('/api/fitness/habits/quick', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ habit: 'water', amount: 250 }),
      }),
    )
    check(
      'quick water increments the day',
      water.status === 200 && water.body.value === waterBefore + 250,
      JSON.stringify(water.body),
    )

    const proteinBefore = beforeToday?.protein_g ?? 0
    const protein = await json(
      await call('/api/fitness/habits/quick', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ habit: 'protein', amount: 20 }),
      }),
    )
    check(
      'quick protein increments the day',
      protein.status === 200 && protein.body.value === proteinBefore + 20,
      JSON.stringify(protein.body),
    )

    const stretch = await json(
      await call('/api/fitness/habits/quick', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ habit: 'stretch', amount: 10 }),
      }),
    )
    check(
      'quick stretch stores a habit value',
      stretch.status === 200 && stretch.body.value === 10,
      JSON.stringify(stretch.body),
    )

    const after = await json(await call('/api/fitness/habits', { headers: authHeaders }))
    const afterToday = after.body.days?.[after.body.days.length - 1]
    check(
      'habits reflect water, protein, and stretch adds',
      afterToday?.water_ml === waterBefore + 250 &&
        afterToday?.protein_g === proteinBefore + 20 &&
        afterToday?.stretch_min === 10,
      JSON.stringify(afterToday),
    )
  }
  {
    const unauthorized = await json(
      await call('/api/fitness/habits/quick', {
        method: 'POST',
        body: JSON.stringify({ habit: 'water', amount: 250 }),
      }),
    )
    check('quick habit without cookie -> 401', unauthorized.status === 401)
  }
  {
    const bad = await json(
      await call('/api/fitness/habits/quick', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ habit: 'sleep', amount: 8 }),
      }),
    )
    check('quick habit rejects unsupported habits -> 400', bad.status === 400 && bad.body.error === 'invalid_habit')
  }

  console.log('\n-- measurements --')
  {
    const created = await json(
      await call('/api/fitness/measurements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ weight_kg: 80, waist_cm: 90, note: 'Morning' }),
      }),
    )
    const measurement = created.body.measurement
    const measurementDay = measurement?.recorded_at
    check(
      'measurement create returns the saved row',
      created.status === 200 &&
        measurement?.weight_kg === 80 &&
        measurement?.waist_cm === 90 &&
        measurement?.note === 'Morning',
      JSON.stringify(created.body),
    )

    const updated = await json(
      await call('/api/fitness/measurements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ date: measurementDay, weight_kg: 79.5 }),
      }),
    )
    check(
      'measurement upsert preserves fields that were omitted',
      updated.status === 200 &&
        updated.body.measurement?.id === measurement?.id &&
        updated.body.measurement?.weight_kg === 79.5 &&
        updated.body.measurement?.waist_cm === 90 &&
        updated.body.measurement?.note === 'Morning',
      JSON.stringify(updated.body),
    )

    const listed = await json(
      await call('/api/fitness/measurements', { headers: authHeaders }),
    )
    check(
      'measurement history lists the row',
      listed.status === 200 &&
        listed.body.measurements?.length === 1 &&
        listed.body.measurements?.[0]?.weight_kg === 79.5,
      JSON.stringify(listed.body).slice(0, 300),
    )

    const invalid = await json(
      await call('/api/fitness/measurements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ weight_kg: 999 }),
      }),
    )
    check('measurement rejects out-of-range values -> 400', invalid.status === 400)

    const future = await json(
      await call('/api/fitness/measurements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ date: addDays(measurementDay, 1), weight_kg: 80 }),
      }),
    )
    check('measurement rejects a future date -> 400', future.status === 400)

    const empty = await json(
      await call('/api/fitness/measurements', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ note: 'no numbers' }),
      }),
    )
    check('measurement requires at least one value -> 400', empty.status === 400)

    const removed = await json(
      await call(`/api/fitness/measurements/${measurement?.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
    )
    check('measurement delete removes the row', removed.status === 200 && removed.body.deleted === true)
  }
  {
    const unauthorized = await json(await call('/api/fitness/measurements'))
    check('measurements without cookie -> 401', unauthorized.status === 401)
  }

  console.log('\n-- food database --')
  {
    const search = await json(
      await call('/api/fitness/foods?q=roti', { headers: authHeaders }),
    )
    check(
      'food search finds seeded Indian foods',
      search.status === 200 &&
        search.body.foods?.some((food) => food.id === 'seed-chapati'),
      JSON.stringify(search.body).slice(0, 300),
    )

    const brand = await json(
      await call('/api/fitness/foods?q=amul', { headers: authHeaders }),
    )
    check(
      'food search matches brands',
      brand.status === 200 && brand.body.foods?.some((food) => food.brand === 'Amul'),
      JSON.stringify(brand.body).slice(0, 300),
    )

    const before = await json(await call('/api/fitness/log/today', { headers: authHeaders }))
    const caloriesBefore = (before.body.logs ?? [])
      .filter((log) => log.type === 'nutrition')
      .reduce((sum, log) => sum + (log.calories ?? 0), 0)

    const logged = await json(
      await call('/api/fitness/foods/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ food_id: 'seed-chapati', grams: 80 }),
      }),
    )
    check(
      'portion scaling computes food nutrition',
      logged.status === 200 &&
        logged.body.item?.calories === 240 &&
        logged.body.item?.protein_g === 8,
      JSON.stringify(logged.body).slice(0, 300),
    )

    const afterFood = await json(await call('/api/fitness/log/today', { headers: authHeaders }))
    const caloriesAfterFood = (afterFood.body.logs ?? [])
      .filter((log) => log.type === 'nutrition')
      .reduce((sum, log) => sum + (log.calories ?? 0), 0)
    check(
      'food log adds to the day nutrition total',
      caloriesAfterFood === caloriesBefore + 240,
      JSON.stringify({ caloriesBefore, caloriesAfterFood }),
    )

    const manual = await json(
      await call('/api/fitness/foods/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          manual: { name: 'Test thali', calories: 400, protein_g: 20, carbs_g: 50, fat_g: 10 },
        }),
      }),
    )
    check(
      'manual food entry adds nutrition',
      manual.status === 200 && manual.body.item?.calories === 400,
      JSON.stringify(manual.body).slice(0, 300),
    )

    const missing = await json(
      await call('/api/fitness/foods/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ food_id: 'missing-food', grams: 100 }),
      }),
    )
    check('unknown food -> 404', missing.status === 404)

    const badPortion = await json(
      await call('/api/fitness/foods/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ food_id: 'seed-chapati', grams: 0 }),
      }),
    )
    check('food log rejects a zero portion -> 400', badPortion.status === 400)

    const future = await json(
      await call('/api/fitness/foods/log', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ food_id: 'seed-chapati', grams: 80, date: addDays(logged.body.date, 1) }),
      }),
    )
    check('food log rejects a future date -> 400', future.status === 400)
  }
  {
    const unauthorized = await json(await call('/api/fitness/foods'))
    check('food search without cookie -> 401', unauthorized.status === 401)
  }

  console.log('\n-- guard & logout --')
  {
    const { status } = await json(await call('/api/fitness/log/today'))
    check('protected route without cookie -> 401', status === 401)
  }
  {
    const logout = await call('/api/auth/logout', { method: 'POST', headers: authHeaders })
    const { status, body } = await json(logout)
    const clearCookie = logout.headers.get('set-cookie') ?? ''
    check('logout 200 ok', status === 200 && body.ok === true)
    check(
      'cleared session cookie keeps Secure/HttpOnly/Lax',
      /fitness_session=;/.test(clearCookie) &&
        /Secure/.test(clearCookie) &&
        /HttpOnly/.test(clearCookie) &&
        /SameSite=Lax/.test(clearCookie),
      clearCookie,
    )
  }
  {
    const renamed = await kv.get('session:verify-token')
    check('logout deleted KV session', renamed === null)
  }

  console.log(`\n${checks - failures}/${checks} checks passed`)
  if (failures > 0) process.exitCode = 1
} finally {
  await mf.dispose()
}
