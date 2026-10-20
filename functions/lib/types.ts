export interface Bindings {
  DB: D1Database
  fitness_sessions: KVNamespace
  ENVIRONMENT: string
  PUBLIC_ORIGIN: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  ADMIN_EMAIL?: string
  FREELLM_BASE_URL?: string
  FREELLM_VL_MODEL?: string
  FREELLM_TEXT_MODEL?: string
  FREELLM_API_KEY?: string
}

export interface PublicUser {
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

export interface Variables {
  userId?: string
}