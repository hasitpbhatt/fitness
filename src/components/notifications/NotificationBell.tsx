import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNotifications } from '../../lib/notifications'

export function NotificationBell() {
  const { notifications, unread, loading, view, dismiss } = useNotifications()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- close the panel after navigation
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const openNotification = (id: string, url: string | null) => {
    void view(id)
    setOpen(false)
    if (url) navigate(url)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-content"
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082A23.85 23.85 0 0 0 12 17.25c-2.343 0-4.607-.34-6.75-.99A8.25 8.25 0 0 0 6.75 9.75V9a5.25 5.25 0 0 1 10.5 0v.75a8.25 8.25 0 0 0 1.5 6.51c-.63.22-1.28.4-1.94.55M8.25 19.5a3.75 3.75 0 0 0 7.5 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[13px] font-semibold">Notifications</h2>
            <span className="text-[11px] text-muted">{unread} unread</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="space-y-2 p-4" role="status" aria-label="Loading notifications">
                <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted">Nothing new right now.</p>
            ) : (
              <div className="divide-y divide-line">
                {notifications.map((item) => (
                  <div key={item.id} className="flex gap-2 px-3 py-3 hover:bg-surface-2">
                    <button
                      type="button"
                      onClick={() => openNotification(item.id, item.url)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-2 text-[13px] font-medium">
                        {item.viewed === 0 && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                        )}
                        <span className="truncate">{item.title}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{item.body}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismiss(item.id)}
                      className="self-start rounded p-1 text-muted hover:bg-surface-3 hover:text-content"
                      aria-label={`Dismiss ${item.title}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
