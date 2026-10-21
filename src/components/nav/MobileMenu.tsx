import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function MobileMenu({
  open,
  onClose,
  isAdmin = false,
}: {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-72 bg-bg border-l border-line p-4">
        <div className="flex items-center justify-between mb-6">
          <span className="font-semibold text-content">fitness</span>
          <button onClick={onClose} className="text-muted hover:text-content">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          <Link to="/dashboard" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Dashboard</Link>
          <Link to="/coach" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">AI coach</Link>
          <Link to="/log" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Log</Link>
          <Link to="/foods" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Foods</Link>
          <Link to="/meal-plan" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Meal plan</Link>
          <Link to="/measurements" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Measurements</Link>
          <Link to="/achievements" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Achievements</Link>
          <Link to="/leaderboard" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Leaderboard</Link>
          {isAdmin && (
            <>
              <Link to="/admin/members" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Members</Link>
              <Link to="/admin/notifications" onClick={onClose} className="px-3 py-2 text-[13px] text-content hover:bg-surface-2 rounded-lg">Notifications</Link>
            </>
          )}
          <Link to="/install" onClick={onClose} className="px-3 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-content rounded-lg">Install app</Link>
        </nav>
      </div>
    </div>
  )
}