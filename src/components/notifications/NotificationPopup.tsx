import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../lib/notifications'

export function NotificationPopup() {
  const { popup, view, dismiss, closePopup } = useNotifications()
  const navigate = useNavigate()
  if (!popup) return null

  const open = () => {
    void view(popup.id)
    closePopup()
    if (popup.url) navigate(popup.url)
  }

  return (
    <div
      className="fixed bottom-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 shadow-2xl md:bottom-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{popup.title}</p>
          <p className="mt-1 text-[12px] text-muted">{popup.body}</p>
        </div>
        <button
          type="button"
          onClick={closePopup}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-content"
          aria-label="Close notification"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void dismiss(popup.id)}
          className="min-h-[36px] rounded-lg px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-content"
        >
          Dismiss
        </button>
        {popup.url ? (
          <button type="button" onClick={open} className="btn-primary min-h-[36px] text-[12px]">
            Open
          </button>
        ) : (
          <button type="button" onClick={closePopup} className="btn-secondary min-h-[36px] text-[12px]">
            Got it
          </button>
        )}
      </div>
    </div>
  )
}
