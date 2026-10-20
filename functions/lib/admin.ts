import type { Bindings } from './types'

export async function isAdmin(env: Bindings, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT role FROM freellm_users WHERE id = ?')
    .bind(userId)
    .first<{ role: string }>()
  return row?.role === 'admin'
}
