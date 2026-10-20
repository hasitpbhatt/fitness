import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/log', label: 'Log' },
  { to: '/achievements', label: 'Badges' },
  { to: '/leaderboard', label: 'Rank' },
]

export function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-bg/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-accent' : 'text-muted hover:text-content'
              }`
            }
          >
            {({ isActive }) => (
              <span aria-current={isActive ? 'page' : undefined}>{item.label}</span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}