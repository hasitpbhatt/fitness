import type { Bindings } from './types'

export type FitnessTier = 'free' | 'plus' | 'coach'
export type EntitlementStatus = 'active' | 'trial' | 'revoked' | 'expired'

export type EntitlementRow = {
  entitlement_user_id: string | null
  role: string | null
  tier: string | null
  status: string | null
  trial_ends_at: number | null
  ends_at: number | null
  note: string | null
}

export type FitnessEntitlement = {
  tier: FitnessTier
  tier_label: string
  status: EntitlementStatus
  is_active: boolean
  trial_ends_at: number | null
  ends_at: number | null
  note: string | null
  source: 'admin' | 'grant' | 'default'
  features: { ai_tools: boolean }
}

const TIER_LABELS: Record<FitnessTier, string> = {
  free: 'Free',
  plus: 'Plus',
  coach: 'Coach',
}

function asTier(value: string | null | undefined): FitnessTier {
  return value === 'plus' || value === 'coach' ? value : 'free'
}

function asStatus(value: string | null | undefined): EntitlementStatus {
  return value === 'trial' || value === 'revoked' || value === 'expired' ? value : 'active'
}

export function effectiveEntitlement(row: EntitlementRow | null, now = Date.now()): FitnessEntitlement {
  if (row?.role === 'admin') {
    return {
      tier: 'coach',
      tier_label: TIER_LABELS.coach,
      status: 'active',
      is_active: true,
      trial_ends_at: null,
      ends_at: null,
      note: 'Admin access',
      source: 'admin',
      features: { ai_tools: true },
    }
  }

  const rawTier = asTier(row?.tier)
  let status = asStatus(row?.status)
  const endsAt = typeof row?.ends_at === 'number' ? row.ends_at : null
  const revoked = status === 'revoked'
  const expired = !revoked && endsAt !== null && endsAt <= now
  if (expired) status = 'expired'

  const tier: FitnessTier = revoked || expired ? 'free' : rawTier
  return {
    tier,
    tier_label: TIER_LABELS[tier],
    status,
    is_active: tier !== 'free',
    trial_ends_at: typeof row?.trial_ends_at === 'number' ? row.trial_ends_at : null,
    ends_at: endsAt,
    note: row?.note ?? null,
    source: row?.entitlement_user_id ? 'grant' : 'default',
    features: { ai_tools: tier !== 'free' },
  }
}

export async function getEntitlement(env: Bindings, userId: string): Promise<FitnessEntitlement> {
  const row = await env.DB.prepare(
    `SELECT u.role, e.user_id AS entitlement_user_id,
       e.tier, e.status, e.trial_ends_at, e.ends_at, e.note
     FROM freellm_users u
     LEFT JOIN fitness_entitlements e ON e.user_id = u.id
     WHERE u.id = ?`,
  )
    .bind(userId)
    .first<EntitlementRow>()
  const entitlement = effectiveEntitlement(row)

  if (row && entitlement.status === 'expired' && row.status !== 'expired') {
    await env.DB.prepare(
      "UPDATE fitness_entitlements SET status = 'expired', updated_at = ? WHERE user_id = ?",
    )
      .bind(Date.now(), userId)
      .run()
      .catch((err) => console.error('[entitlements] expiry update failed', err))
  }

  return entitlement
}

export async function canUseAITools(env: Bindings, userId: string): Promise<boolean> {
  return (await getEntitlement(env, userId)).features.ai_tools
}
