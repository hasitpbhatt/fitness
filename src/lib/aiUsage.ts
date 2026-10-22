import type { ScanQuota } from './types'

export const AI_EXHAUSTED_MESSAGE =
  "You've used all your AI estimates for today. Try again tomorrow or log manually."

export const AI_UNAVAILABLE_MESSAGE =
  'AI estimates are temporarily unavailable. You can still log food manually.'

export const AI_OUT_OF_CREDITS_MESSAGE =
  'Your freellm account is out of credits. Add credits there to keep using AI estimates.'

export const AI_SHARED_QUOTA_NOTE =
  'Photo scans, text estimates, and food search share one daily AI budget.'

export const AI_COACH_LIMIT = 20

export const COACH_EXHAUSTED_MESSAGE =
  "You've used all 20 coach messages for today. Try again tomorrow."

export const COACH_UNAVAILABLE_MESSAGE =
  'The AI coach is temporarily unavailable. You can still log your day.'

export const COACH_OUT_OF_CREDITS_MESSAGE =
  'Your freellm account is out of credits. Add credits there to keep using the coach.'

export const COACH_QUOTA_NOTE = 'Each question uses one of your daily coach replies.'

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
