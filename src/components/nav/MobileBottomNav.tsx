import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '../icons'

type NavItem = {
  to: string
  label: string
  icon: IconName
  primary?: boolean
}

// Five targets, and the one thing you do most often (log) is the physical
// centre of the bar where the thumb already rests.
const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/coach', label: 'Coach', icon: 'chat' },
  { to: '/log', label: 'Log', icon: 'plus-circle', primary: true },
  { to: '/achievements', label: 'Badges', icon: 'trophy' },
  { to: '/leaderboard', label: 'Rank', icon: 'bar-chart' },
]

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-bg/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex h-[var(--bottom-nav-h)] max-w-lg items-stretch justify-between px-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              item.primary
                ? 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium'
                : `flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-accent' : 'text-muted active:text-content'
                  }`
            }
          >
            {({ isActive }) =>
              item.primary ? (
                <>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-accent text-white' : 'bg-accent/15 text-accent'
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name={item.icon} size={22} strokeWidth={2.2} />
                  </span>
                  <span className={isActive ? 'text-accent' : 'text-muted'}>{item.label}</span>
                </>
              ) : (
                <>
                  <Icon name={item.icon} size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
