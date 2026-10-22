// Shared feedback primitives.
//
// Before this file every page invented its own banner, skeleton and empty
// state, so the same idea looked different on six screens. One component per
// idea means an error is always an error, and always reachable by keyboard
// and screen reader.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from './ui'
import { Icon, type IconName } from './icons'
import { useModalFocus } from '../lib/useModalFocus'
import { ToastContext, type ToastAction, type ToastContextValue, type ToastTone } from '../lib/useToast'

// --------------------------------------------------------------- empty state

type EmptyStateProps = {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * The "nothing here yet" panel. It always says what is missing and, when the
 * user can do something about it, offers the one action that fixes it.
 */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-8 text-center ${className}`}>
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Icon name={icon} size={22} />
        </span>
      )}
      <p className="text-[13px] font-medium text-content">{title}</p>
      {description && <p className="max-w-sm text-[12px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// --------------------------------------------------------------------- alert

type AlertTone = 'info' | 'success' | 'warning' | 'danger'

type AlertProps = {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

const ALERT_TONES: Record<AlertTone, { wrapper: string; icon: IconName }> = {
  info: { wrapper: 'border-line bg-surface-2 text-content', icon: 'info' },
  success: { wrapper: 'border-gain/30 bg-gain/10 text-gain', icon: 'check' },
  warning: { wrapper: 'border-warn/30 bg-warn/10 text-warn', icon: 'alert' },
  danger: { wrapper: 'border-loss/30 bg-loss/10 text-loss', icon: 'alert' },
}

/**
 * One banner for every kind of message. Errors are announced assertively
 * (`role="alert"`), everything else politely, so a screen reader interrupts
 * only when it must.
 */
export function Alert({ tone = 'info', title, children, action, onDismiss, className = '' }: AlertProps) {
  const config = ALERT_TONES[tone]
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] ${config.wrapper} ${className}`}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      <Icon name={config.icon} size={16} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : 'opacity-90'}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ skeleton

type SkeletonProps = {
  className?: string
  label?: string
}

/** A pulsing placeholder. Always labelled so it is not read as content. */
export function Skeleton({ className = '', label = 'Loading' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-2 ${className}`}
      role="status"
      aria-label={label}
    />
  )
}

// --------------------------------------------------------------------- badge

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-2 text-muted',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-gain/30 bg-gain/10 text-gain',
  warning: 'border-warn/30 bg-warn/10 text-warn',
  danger: 'border-loss/30 bg-loss/10 text-loss',
  info: 'border-muted/30 bg-muted/10 text-muted',
}

export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

// --------------------------------------------------------------------- toast

type Toast = { id: number; message: string; tone: ToastTone; action?: ToastAction }

/**
 * Transient confirmation. Toasts auto-dismiss, but a toast that offers an
 * action (like Undo) stays until the user acts on it or dismisses it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback<ToastContextValue['showToast']>(
    (message, options) => {
      const id = nextId.current++
      const toast: Toast = {
        id,
        message,
        tone: options?.tone ?? 'success',
        action: options?.action,
      }
      setToasts((current) => [...current.slice(-2), toast])
      if (!toast.action) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), 4000),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((timer) => clearTimeout(timer))
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container flex flex-col items-stretch gap-2" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[12px] shadow-lg ${
                toast.tone === 'danger'
                  ? 'border-loss/30 bg-surface text-loss'
                  : toast.tone === 'info'
                    ? 'border-line bg-surface text-content'
                    : 'border-gain/30 bg-surface text-gain'
              }`}
            >
              <span className="min-w-0 flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="tap shrink-0 rounded px-2 font-medium text-accent hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="tap shrink-0 rounded p-1 opacity-70 hover:opacity-100"
                aria-label="Dismiss"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

// -------------------------------------------------------------- confirm dialog

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A real confirmation for destructive actions. The destructive button is
 * visually distinct from the safe one, so a mis-tap is obvious.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(open, dialogRef, onCancel, busy)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-description' : undefined}
        tabIndex={-1}
        className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-5 shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-[15px] font-semibold text-content">
          {title}
        </h2>
        {description && (
          <p id="confirm-description" className="mt-1.5 text-[13px] text-muted">
            {description}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          {tone === 'danger' ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="btn-danger flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          ) : (
            <Button className="flex-1" onClick={onConfirm} loading={busy}>
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
