// Auth: Google OAuth sign-in/sign-up, session resolution for /api/me, logout.

import { Hono } from 'hono'
import { newId } from '../lib/crypto'
import { isEmailBlocked } from '../lib/email-blocks'
import {
  createSession,
  destroySession,
  getSession,
  clearedSessionCookie,
  clearedOAuthStateCookie,
  oauthStateCookie,
  readCookie,
  OAUTH_STATE_COOKIE,
} from '../lib/session'
import { generateReferralCode, normalizeEmail } from '../lib/validate'
import { allowRequest } from '../lib/ratelimit'
import type { Bindings, PublicUser, Variables } from '../lib/types'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

type UserLike = {
  id: string
  email: string
  username: string
  display_name: string | null
  avatar_url: string | null
  referral_code: string
  balance_credits: number
  role: 'user' | 'admin'
  tier: 'free' | 'pro' | 'enterprise'
  email_verified: number
  referred_by: string | null
  created_at: number
  updated_at: number
}

const toPublicUser = (row: UserLike): PublicUser => ({
  id: row.id,
  email: row.email,
  username: row.username,
  display_name: row.display_name,
  avatar_url: row.avatar_url,
  referral_code: row.referral_code,
  balance_credits: row.balance_credits,
  role: row.role,
  tier: row.tier ?? 'free',
  email_verified: row.email_verified,
  referred_by: row.referred_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
})

// Re-export for use in other routes
export { createSession, destroySession, getSession, clearedSessionCookie }

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

function buildGoogleAuthUrl(env: Bindings, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: `${env.PUBLIC_ORIGIN ?? 'https://fitness.hasit.in'}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

async function exchangeCodeForTokens(env: Bindings, code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '',
    client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!response.ok) {
    const error = await response.text().catch(() => '')
    throw new Error(`Token exchange failed: ${response.status} ${error}`)
  }
  return response.json<{ access_token: string; id_token?: string; refresh_token?: string; expires_in: number }>()
}

async function fetchGoogleUser(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('Failed to fetch Google user info')
  return response.json<{ sub: string; email: string; email_verified: boolean; name: string; picture: string }>()
}

app.get('/api/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.json({ error: 'not_configured', message: 'Google OAuth is not configured.' }, 500)
  }
  const ip = c.req.header('cf-connecting-ip') ?? 'local'
  if (!(await allowRequest(c.env.fitness_sessions, `oauth:${ip}`, 20, 10 * 60))) {
    return c.json({ error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' }, 429)
  }
  const state = newId()
  const nonce = newId()
  const origin = c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin
  const next = c.req.query('next')
  const safeNext = typeof next === 'string' && /^\/[^/\\]/.test(next) ? next : null
  const refRaw = c.req.query('ref')
  const ref =
    typeof refRaw === 'string' && /^[a-z0-9]{2,32}$/i.test(refRaw.trim()) ? refRaw.trim().toLowerCase() : null
  await c.env.fitness_sessions.put(
    `oauth:state:${state}`,
    JSON.stringify({ origin, next: safeNext, ref, nonce }),
    { expirationTtl: 600 },
  )
  // Bind the flow to this browser: a copied callback URL cannot sign the victim in.
  c.header('Set-Cookie', oauthStateCookie(nonce))
  return c.redirect(buildGoogleAuthUrl(c.env, state))
})

app.get('/api/auth/google/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return c.text('Google OAuth is not configured.', 500)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  if (error) {
    const origin = c.env.PUBLIC_ORIGIN ?? 'https://fitness.hasit.in'
    return c.redirect(`${origin}/login?error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return c.text('Missing code or state.', 400)
  }

  const storedRaw = await c.env.fitness_sessions.get(`oauth:state:${state}`)
  if (!storedRaw) {
    c.header('Set-Cookie', clearedOAuthStateCookie())
    return c.text('Invalid or expired OAuth state.', 400)
  }
  const redirectOrigin = c.env.PUBLIC_ORIGIN ?? new URL(c.req.url).origin
  let nextPath = '/dashboard'
  let stateRef: string | null = null
  const cookieNonce = readCookie(c.req.header('cookie'), OAUTH_STATE_COOKIE)
  let stateNonce: string | null = null
  try {
    const parsed = JSON.parse(storedRaw) as { next?: string | null; ref?: string | null; nonce?: string | null }
    if (typeof parsed?.next === 'string') {
      let decoded = parsed.next
      try { decoded = decodeURIComponent(parsed.next) } catch { decoded = parsed.next }
      if (/^\/[^/\\]/.test(decoded) && !decoded.startsWith('/%')) nextPath = parsed.next
    }
    if (typeof parsed?.ref === 'string' && /^[a-z0-9]{2,32}$/i.test(parsed.ref)) {
      stateRef = parsed.ref.toLowerCase()
    }
    if (typeof parsed?.nonce === 'string') stateNonce = parsed.nonce
  } catch {}
  // A mismatch must not burn the state: an attacker could otherwise invalidate
  // a legitimate in-flight login by replaying its callback URL.
  if (!stateNonce || cookieNonce !== stateNonce) {
    c.header('Set-Cookie', clearedOAuthStateCookie())
    return c.text('Invalid or expired OAuth state.', 400)
  }
  await c.env.fitness_sessions.delete(`oauth:state:${state}`)
  const redirectUri = `${redirectOrigin}/api/auth/google/callback`

  try {
    const tokens = await exchangeCodeForTokens(c.env, code, redirectUri)
    const googleUser = await fetchGoogleUser(tokens.access_token)
    if (!googleUser.email_verified) {
      return c.redirect(`${redirectOrigin}/login?error=${encodeURIComponent('Google email not verified.')}`)
    }

    const email = normalizeEmail(googleUser.email)
    const now = Date.now()

    const blockedBy = await isEmailBlocked(c.env.DB, email)
    if (blockedBy) {
      console.warn('[oauth] blocked sign-in attempt for pattern match')
      return c.redirect(`${redirectOrigin}/login?error=${encodeURIComponent('That email domain is not allowed.')}`)
    }

    let user = await c.env.DB.prepare('SELECT * FROM freellm_users WHERE email = ?').bind(email).first<{ id: string; email_verified: number }>()

    if (!user) {
      const rawBase = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
      const usernameBase = rawBase.length >= 3 ? rawBase : `user${Date.now().toString(36).slice(-6)}`
      let username = usernameBase
      for (let i = 0; i < 10; i++) {
        const taken = await c.env.DB.prepare('SELECT 1 FROM freellm_users WHERE username = ?').bind(username).first()
        if (!taken) break
        username = `${usernameBase.slice(0, 18)}${i + 1}`
        if (i === 9) username = `${usernameBase.slice(0, 12)}${Date.now().toString(36).slice(-6)}`
      }

      let referralCode = generateReferralCode()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const taken = await c.env.DB.prepare('SELECT 1 FROM freellm_users WHERE referral_code = ?').bind(referralCode).first()
        if (!taken) break
        referralCode = generateReferralCode()
      }
      const userId = newId()

      let referrerId: string | null = null
      if (stateRef) {
        const referrer = await c.env.DB.prepare('SELECT id FROM freellm_users WHERE referral_code = ?').bind(stateRef).first<{ id: string }>()
        if (referrer && referrer.id !== userId) referrerId = referrer.id
      }
      const isFirstUser = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM freellm_users').first<{ n: number }>())?.n === 0
      const isAdminEmail = !!c.env.ADMIN_EMAIL && email === normalizeEmail(c.env.ADMIN_EMAIL)
      const role: 'user' | 'admin' = isFirstUser || isAdminEmail ? 'admin' : 'user'

      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO freellm_users (id, email, username, password_hash, referral_code, balance_credits, role, email_verified, referred_by, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, 0, ?, 1, ?, ?, ?)`
        ).bind(userId, email, username, referralCode, role, referrerId, now, now),
        c.env.DB.prepare(
          `INSERT INTO freellm_auth_identities (id, user_id, provider, subject, email, email_verified, created_at)
           VALUES (?, ?, 'google', ?, ?, 1, ?)`
        ).bind(newId(), userId, googleUser.sub, email, now),
        c.env.DB.prepare(
          `INSERT INTO fitness_logs (id, user_id, type, recorded_at, activity, created_at, updated_at)
           VALUES (?, ?, 'custom', ?, 'Welcome to fitness.hasit.in', ?, ?)`
        ).bind(newId(), userId, new Date(now).toISOString().split('T')[0], now, now),
        ...(referrerId
          ? [
              c.env.DB.prepare(
                `INSERT INTO freellm_referrals (id, referrer_id, referred_id, status, created_at) VALUES (?, ?, ?, 'waiting', ?)`
              ).bind(newId(), referrerId, userId, now),
            ]
          : []),
      ])

      user = await c.env.DB.prepare('SELECT * FROM freellm_users WHERE id = ?').bind(userId).first<{ id: string; email_verified: number }>()
    } else {
      const existing = await c.env.DB.prepare('SELECT 1 FROM freellm_auth_identities WHERE user_id = ? AND provider = ?').bind(user.id, 'google').first()
      if (!existing) {
        await c.env.DB.prepare(
          `INSERT INTO freellm_auth_identities (id, user_id, provider, subject, email, email_verified, created_at)
           VALUES (?, ?, 'google', ?, ?, 1, ?)`
        ).bind(newId(), user.id, googleUser.sub, email, now)
      }
      if (user.email_verified !== 1) {
        await c.env.DB.prepare('UPDATE freellm_users SET email_verified = 1, updated_at = ? WHERE id = ?').bind(now, user.id)
      }
    }

    const session = await createSession(c.env.fitness_sessions, user!.id)
    c.header('Set-Cookie', session.cookie)
    c.header('Set-Cookie', clearedOAuthStateCookie(), { append: true })
    return c.redirect(`${redirectOrigin}${nextPath}`)
  } catch (err) {
    console.error('[oauth] Google callback error:', err)
    return c.redirect(`${redirectOrigin}/login?error=${encodeURIComponent('Authentication failed.')}`)
  }
})

// Me endpoint
app.get('/api/me', async (c) => {
  const cookie = c.req.header('cookie') ?? null
  const session = await getSession(c.env.fitness_sessions, cookie)
  if (!session) return c.json({ user: null })
  const user = await c.env.DB.prepare('SELECT * FROM freellm_users WHERE id = ?').bind(session.userId).first()
  if (!user) return c.json({ user: null })
  return c.json({ user: toPublicUser(user as UserLike) })
})

// Logout
app.post('/api/auth/logout', async (c) => {
  await destroySession(c.env.fitness_sessions, c.req.header('cookie'))
  c.header('Set-Cookie', clearedSessionCookie())
  return c.json({ ok: true })
})

export default app