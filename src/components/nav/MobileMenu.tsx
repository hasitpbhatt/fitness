import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../icons'
import { useModalFocus } from '../../lib/useModalFocus'
import { LOCALES, useLocale } from '../../i18n'
import type { TranslationKey } from '../../i18n/en'

type MenuItem = { to: string; labelKey: TranslationKey; icon: IconName }

const memberItems: MenuItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'home' },
  { to: '/coach', labelKey: 'nav.coach', icon: 'chat' },
  { to: '/log', labelKey: 'nav.log', icon: 'plus-circle' },
  { to: '/foods', labelKey: 'nav.foods', icon: 'utensils' },
  { to: '/meal-plan', labelKey: 'nav.mealPlan', icon: 'book' },
  { to: '/measurements', labelKey: 'nav.measurements', icon: 'scale' },
  { to: '/achievements', labelKey: 'nav.achievements', icon: 'trophy' },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: 'bar-chart' },
]

const adminItems: MenuItem[] = [
  { to: '/admin/members', labelKey: 'nav.members', icon: 'user' },
  { to: '/admin/access', labelKey: 'nav.access', icon: 'lock' },
  { to: '/admin/analytics', labelKey: 'nav.analytics', icon: 'bar-chart' },
  { to: '/admin/notifications', labelKey: 'nav.notifications', icon: 'bell' },
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
  const { t, locale, setLocale } = useLocale()
  useModalFocus(open, panelRef, onClose)

  if (!open) return null

  const items = isAdmin ? [...memberItems, ...adminItems] : memberItems

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
        onClick={onClose}
        aria-label={t('nav.closeMenu')}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menuTitle')}
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
            aria-label={t('nav.closeMenu')}
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <nav aria-label={t('nav.menuTitle')} className="min-h-0 flex-1 overflow-y-auto p-2">
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
                  {t(item.labelKey)}
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
                {t('nav.install')}
              </Link>
            </li>
          </ul>
        </nav>

        {/* Language. A person who cannot read the app cannot use it, so this
            is a first-class control, not buried in settings. */}
        <div className="border-t border-line p-3">
          <p className="mb-1.5 px-1 text-[11px] uppercase tracking-wide text-muted">
            {t('nav.language')}
          </p>
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t('nav.language')}>
            {LOCALES.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => setLocale(option.code)}
                aria-pressed={locale === option.code}
                className={`min-h-[40px] rounded-lg border px-1 text-[13px] font-medium transition-colors ${
                  locale === option.code
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-muted hover:bg-surface-2 hover:text-content'
                }`}
              >
                {option.native}
              </button>
            ))}
          </div>
        </div>

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
              {t('nav.signOut')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
