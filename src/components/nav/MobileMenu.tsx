import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { useModalFocus } from '../../lib/useModalFocus'

type MenuItem = { to: string; label: string; icon: IconName }

const memberItems: MenuItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/coach', label: 'AI coach', icon: 'chat' },
  { to: '/log', label: 'Log activity', icon: 'plus-circle' },
  { to: '/foods', label: 'Foods', icon: 'utensils' },
  { to: '/meal-plan', label: 'Meal plan', icon: 'book' },
  { to: '/measurements', label: 'Measurements', icon: 'scale' },
  { to: '/achievements', label: 'Achievements', icon: 'trophy' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'bar-chart' },
]

const adminItems: MenuItem[] = [
  { to: '/admin/members', label: 'Members', icon: 'user' },
  { to: '/admin/access', label: 'Access', icon: 'lock' },
  { to: '/admin/analytics', label: 'Analytics', icon: 'bar-chart' },
  { to: '/admin/notifications', label: 'Notifications', icon: 'bell' },
]

export function MobileMenu({
  open,
  onClose,
  isAdmin = false,
  username,
  onSignOut,
}: {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
  username?: string
  onSignOut?: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useModalFocus(open, panelRef, onClose)

  if (!open) return null

  const items = isAdmin ? [...memberItems, ...adminItems] : memberItems

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
        onClick={onClose}
        aria-label="Close menu"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-line bg-bg"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-content">fitness</p>
            {username && <p className="truncate text-[11px] text-muted">@{username}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap flex items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-content"
            aria-label="Close menu"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <nav aria-label="All pages" className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onClose}
                  className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-[13px] text-content hover:bg-surface-2"
                >
                  <span className="text-muted" aria-hidden="true">
                    <Icon name={item.icon} size={19} />
                  </span>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/install"
                onClick={onClose}
                className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-content"
              >
                <span className="text-muted" aria-hidden="true">
                  <Icon name="download" size={19} />
                </span>
                Install app
              </Link>
            </li>
          </ul>
        </nav>

        {onSignOut && (
          <div className="border-t border-line p-2">
            <button
              type="button"
              onClick={onSignOut}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-content"
            >
              <span className="text-muted" aria-hidden="true">
                <Icon name="logout" size={19} />
              </span>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
