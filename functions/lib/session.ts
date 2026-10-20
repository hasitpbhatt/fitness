const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

/** Secure cookies are ignored by browsers unless the origin is HTTPS or localhost. */
export const OAUTH_STATE_COOKIE = 'fitness_oauth'
const OAUTH_STATE_TTL_SECONDS = 10 * 60

export async function createSession(kv: KVNamespace, userId: string): Promise<{ cookie: string }> {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  await kv.put(`session:${id}`, JSON.stringify({ userId, token }), { expirationTtl: SESSION_TTL_SECONDS })
  const cookie = `fitness_session=${id}; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}; Path=/`
  return { cookie }
}

/** Reads a first-party cookie without parsing unrelated names. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=') || null
  }
  return null
}

export function oauthStateCookie(nonce: string): string {
  return `${OAUTH_STATE_COOKIE}=${nonce}; HttpOnly; Secure; SameSite=Lax; Max-Age=${OAUTH_STATE_TTL_SECONDS}; Path=/`
}

export function clearedOAuthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`
}

export async function destroySession(kv: KVNamespace, cookieHeader: string | null | undefined): Promise<void> {
  const match = cookieHeader?.match(/fitness_session=([^;]+)/)
  if (match) await kv.delete(`session:${match[1]}`)
}

export async function getSession(kv: KVNamespace, cookieHeader: string | null): Promise<{ userId: string } | null> {
  const match = cookieHeader?.match(/fitness_session=([^;]+)/)
  if (!match) return null
  const raw = await kv.get(`session:${match[1]}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { userId: string }
  } catch {
    return null
  }
}

export function clearedSessionCookie(): string {
  return 'fitness_session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
}