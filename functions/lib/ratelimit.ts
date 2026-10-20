export async function allowRequest(
  kv: KVNamespace,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const windowKey = `ratelimit:${key}:${windowStart}`
  const current = await kv.get(windowKey)
  const count = current ? parseInt(current, 10) : 0
  if (count >= maxRequests) return false
  await kv.put(windowKey, String(count + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 60 })
  return true
}