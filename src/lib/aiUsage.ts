import type { ScanQuota } from './types'

export const AI_EXHAUSTED_MESSAGE =
  "You've used all your AI estimates for today. Try again tomorrow or log manually."

export const AI_UNAVAILABLE_MESSAGE =
  'AI estimates are temporarily unavailable. You can still log food manually.'

export const AI_SHARED_QUOTA_NOTE =
  'Photo scans, text estimates, and food search share one daily AI budget.'

export function aiRemaining(quota: ScanQuota | null): number | null {
  return quota ? Math.max(0, quota.limit - quota.used) : null
}

export function aiExhausted(quota: ScanQuota | null): boolean {
  return quota !== null && quota.used >= quota.limit
}

export function aiQuotaSummary(quota: ScanQuota): string {
  const remaining = Math.max(0, quota.limit - quota.used)
  if (remaining === 0) return AI_EXHAUSTED_MESSAGE
  return `${remaining} of ${quota.limit} AI estimates left today.`
}
