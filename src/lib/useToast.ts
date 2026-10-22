import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'info' | 'danger'

export type ToastAction = { label: string; onClick: () => void }

export type ToastContextValue = {
  showToast: (message: string, options?: { tone?: ToastTone; action?: ToastAction }) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    // A page rendered outside the provider should still work - it just cannot
    // raise toasts.
    return { showToast: () => undefined }
  }
  return context
}
