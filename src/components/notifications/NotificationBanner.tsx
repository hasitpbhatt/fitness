import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../lib/notifications'

export function NotificationBanner() {
  const { notifications, view, dismiss } = useNotifications()
  const navigate = useNavigate()
  const banner = notifications.find((item) => item.sticky === 1)
  if (!banner) return null

  const open = () => {
    void view(banner.id)
    if (banner.url) navigate(banner.url)
  }

  return (
    <div className="mb-5 flex flex-col gap-2 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{banner.title}</p>
        <p className="mt-0.5 text-[12px] text-muted">{banner.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {banner.url && (
          <button type="button" onClick={open} className="btn-secondary text-[12px]">
            Open
          </button>
        )}
        <button
          type="button"
          onClick={() => void dismiss(banner.id)}
          className="min-h-[36px] rounded-lg px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-content"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
