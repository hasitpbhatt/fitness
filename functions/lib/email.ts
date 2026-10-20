import type { Bindings } from './types'

export async function sendVerificationEmail(env: Bindings, email: string, link: string): Promise<{ devLink?: string }> {
  if (env.ENVIRONMENT !== 'production') {
    return { devLink: link }
  }
  return {}
}