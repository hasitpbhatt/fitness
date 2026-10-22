import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { FitnessProfile } from '../lib/types'
import { detectTimezone } from '../lib/timezone'
import { Icon } from './icons'
import { MobileBottomNav } from './nav/MobileBottomNav'
import { MobileMenu } from './nav/MobileMenu'
import { NotificationBanner } from './notifications/NotificationBanner'
import { NotificationBell } from './notifications/NotificationBell'
import { NotificationPopup } from './notifications/NotificationPopup'
import { NotificationProvider } from './notifications/NotificationProvider'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/coach', label: 'Coach' },
  { to: '/log', label: 'Log' },
  { to: '/foods', label: 'Foods' },
  { to: '/meal-plan', label: 'Meal plan' },
  { to: '/measurements', label: 'Measurements' },
  { to: '/achievements', label: 'Achievements' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

export default function AppShell() {
  return (
    <NotificationProvider>
      <AppShellContent />
    </NotificationProvider>
  )
}

function AppShellContent() {
  const { user, loading, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const location = useLocation()
  const displayNavItems =
    user?.role === 'admin'
      ? [
          ...navItems,
          { to: '/admin/members', label: 'Members' },
          { to: '/admin/access', label: 'Access' },
          { to: '/admin/analytics', label: 'Analytics' },
          { to: '/admin/notifications', label: 'Notifications' },
        ]
      : navItems

  useEffect(() => {
    if (!user) {
      setStreak(null)
      return
    }
    let cancelled = false
    api.get<{ streaks: { current_streak: number } | null }>('/fitness/streaks')
      .then((d) => {
        if (!cancelled) setStreak(d.streaks?.current_streak ?? 0)
      })
      .catch(() => {
        // Streak pill is decorative — ignore failures.
      })
    return () => {
      cancelled = true
    }
  }, [user, location.pathname])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .get<FitnessProfile>(`/fitness/profile?tz=${encodeURIComponent(detectTimezone())}`)
      .then((profile) => {
        if (!cancelled) setOnboarded(profile.onboarded)
      })
      .catch(() => {
        // Never trap a signed-in member behind a failed preference lookup.
        if (!cancelled) setOnboarded(true)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (user && onboarded === false) return <Navigate to="/onboarding" replace />

  if (user && onboarded === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <p className="text-[13px] text-muted" role="status">
          Loading your setup…
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-20 focus:rounded-md focus:bg-surface-2 focus:px-3 focus:py-1.5 focus:text-[13px]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex min-h-[48px] max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1">
          <Link to="/" className="flex min-h-[44px] items-center gap-2 font-semibold">
            <span className="text-accent" aria-hidden="true">▲</span> fitness
          </Link>
          <nav
            aria-label="Primary"
            className="-mx-1 hidden max-w-full flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap px-1 text-[13px] [scrollbar-width:thin] md:flex"
          >
            {displayNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-2.5 transition-colors ${
                    isActive ? 'bg-surface-2 text-content' : 'text-muted hover:text-content'
                  }`
                }
              >
                {({ isActive }) => (
                  <span aria-current={isActive ? 'page' : undefined}>{item.label}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-h-[44px] items-center gap-3">
            {loading ? (
              <span className="text-[13px] text-muted" role="status">Checking sign-in…</span>
            ) : user ? (
              <>
                {streak != null && streak > 0 && (
                  <Link
                    to="/dashboard"
                    title={`${streak}-day streak`}
                    className="flex min-h-[44px] items-center gap-1 rounded-full border border-line bg-surface-2 px-3 text-[12px] font-medium text-content transition-colors hover:border-accent/50"
                  >
                    <span aria-hidden="true">🔥</span>
                    <span className="num">{streak}</span>
                  </Link>
                )}
                <NotificationBell />
                <span className="hidden text-[13px] text-muted lg:inline">{user.username}</span>
                <button
                  onClick={() => void logout()}
                  className="hidden min-h-[44px] px-1 text-[13px] text-muted hover:text-content md:block"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="tap flex items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-content md:hidden"
                  aria-label="Open menu"
                  aria-expanded={menuOpen}
                >
                  <Icon name="menu" size={24} />
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-primary">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-6 pb-[calc(var(--bottom-nav-h)+var(--safe-bottom)+1rem)] md:pb-6"
      >
        <NotificationBanner />
        <Outlet />
      </main>
      <NotificationPopup />
      <MobileBottomNav />
      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isAdmin={user?.role === 'admin'}
        username={user?.username}
        onSignOut={() => void logout()}
      />
    </div>
  )
}
