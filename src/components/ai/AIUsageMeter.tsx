import {
  AI_EXHAUSTED_MESSAGE,
  AI_SHARED_QUOTA_NOTE,
  AI_UNAVAILABLE_MESSAGE,
  aiExhausted,
  aiRemaining,
} from '../../lib/aiUsage'
import type { ScanQuota } from '../../lib/types'

type Props = {
  quota: ScanQuota | null
  configured?: boolean | null
  className?: string
  label?: string
  note?: string
  exhaustedMessage?: string
  unavailableMessage?: string
}

export function AIUsageMeter({
  quota,
  configured = null,
  className = '',
  label = 'AI estimates',
  note = AI_SHARED_QUOTA_NOTE,
  exhaustedMessage = AI_EXHAUSTED_MESSAGE,
  unavailableMessage = AI_UNAVAILABLE_MESSAGE,
}: Props) {
  if (!quota && configured !== false) return null

  const exhausted = aiExhausted(quota)
  const remaining = aiRemaining(quota)
  const percent = quota ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0

  return (
    <div className={`rounded-lg border border-line bg-surface-2 px-3 py-2 ${className}`}>
      {quota && (
        <>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium text-content">{label}</span>
            <span className={`num ${exhausted ? 'text-warn' : 'text-muted'}`}>
              {quota.used}/{quota.limit} used
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-label={`Daily ${label.toLowerCase()} usage`}
            aria-valuemin={0}
            aria-valuemax={quota.limit}
            aria-valuenow={quota.used}
          >
            <div
              className={`h-full rounded-full ${exhausted ? 'bg-warn' : 'bg-accent'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}
      <p className={`text-[11px] ${exhausted || configured === false ? 'text-warn' : 'text-muted'} ${quota ? 'mt-1.5' : ''}`}>
        {configured === false
          ? unavailableMessage
          : exhausted
            ? exhaustedMessage
            : remaining !== null && quota
              ? `${remaining} left today. ${note}`
              : note}
      </p>
    </div>
  )
}
