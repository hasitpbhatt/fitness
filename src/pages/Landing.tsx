import { Link, Navigate } from 'react-router-dom'
import { Icon } from '../components/icons'
import { useAuth } from '../lib/auth'

const FEATURES = [
  {
    icon: '📝' as const,
    title: 'Log Daily',
    body: 'Log workouts, nutrition, sleep, and water — one entry per day per type.',
  },
  {
    icon: '📸' as const,
    title: 'Snap a meal',
    body: 'Photograph a plate and the AI estimates the macros. You review before it counts.',
  },
  {
    icon: '🔥' as const,
    title: 'Build Streaks',
    body: 'Log every day to build your streak. Earn badges at 3, 7, 14, 30, 90, and 365 days.',
  },
  {
    icon: '🏆' as const,
    title: 'Climb Leaderboard',
    body: 'See how you rank against other members. Weekly totals, anonymous ranks.',
  },
]

const PROMISES = ['Free forever', 'No app store needed', 'Google sign-in only']

export default function Landing() {
  const { user, loading } = useAuth()

  if (user && !loading) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[56px] max-w-5xl items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold text-content">
            <span className="text-accent" aria-hidden="true">▲</span> fitness
          </span>
          <Link to="/login" className="btn-secondary">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-12 pt-10 text-center sm:pb-16 sm:pt-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted">
            <span className="text-accent" aria-hidden="true">⚡</span> Zero-friction daily fitness
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight text-content sm:text-5xl">
            One log per day.
            <span className="block text-accent">Everything else follows.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:text-base">
            One Google sign-in. Photo a plate and the AI estimates the macros. Streaks, badges, and a
            community leaderboard — no app store needed.
          </p>
          <div className="mx-auto mt-7 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link to="/login" className="btn-primary btn-lg">
              Start logging
              <Icon name="chevron-right" size={18} />
            </Link>
            <Link to="/install" className="btn-secondary btn-lg">
              Install app
            </Link>
          </div>
        </section>

        <section className="border-t border-line bg-surface/30">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
            <h2 className="text-center text-[15px] font-semibold text-content sm:text-lg">
              Everything a daily tracker should do
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="card p-5">
                  <div className="mb-3 text-2xl" aria-hidden="true">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-content">{feature.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-8">
            {PROMISES.map((promise) => (
              <span
                key={promise}
                className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[12px] text-muted"
              >
                {promise}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
