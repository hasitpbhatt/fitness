import { Link } from 'react-router-dom'
import { Icon } from '../components/icons'

const SUGGESTIONS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' as const },
  { to: '/log', label: 'Log activity', icon: 'plus-circle' as const },
  { to: '/coach', label: 'AI coach', icon: 'chat' as const },
]

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="text-center">
        <p className="num text-5xl font-bold text-muted">404</p>
        <h1 className="mt-2 text-lg font-semibold text-content">This page does not exist</h1>
        <p className="mt-1 text-[13px] text-muted">
          The link may be old. Pick where you want to go instead.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {SUGGESTIONS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex min-h-[44px] items-center gap-3 rounded-lg border border-line bg-surface px-3 text-[13px] text-content hover:border-accent/50"
          >
            <span className="text-muted" aria-hidden="true">
              <Icon name={item.icon} size={18} />
            </span>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        <Link to="/dashboard" className="btn-primary">
          Go to dashboard
        </Link>
      </div>
    </main>
  )
}
