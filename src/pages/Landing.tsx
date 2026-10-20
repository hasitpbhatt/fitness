import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Landing() {
  const { user, loading } = useAuth()

  if (user && !loading) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <section className="flex-1 flex flex-col items-center justify-center pt-10 pb-6 px-4 text-center">
        <h1 className="text-4xl font-bold text-content mb-4 tracking-tight">
          <span className="text-accent" aria-hidden="true">⚡</span> fitness.hasit.in
        </h1>
        <p className="text-xl text-muted mb-8 max-w-2xl mx-auto leading-relaxed">
          Zero-friction daily fitness. One Google sign-in, one log per day.
          Streaks, badges, and a community leaderboard. No app store needed.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/login" className="btn-primary px-8 py-3 text-sm font-medium">
            Start Logging �+' 
          </Link>
          <Link to="/install" className="btn-secondary px-8 py-3 text-sm font-medium">
            Install app
          </Link>
        </div>
      </section>

      <section className="border-t border-line bg-surface/30">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="card p-6 text-center">
              <div className="text-accent text-2xl mb-3" aria-hidden="true">📝</div>
              <h3 className="font-semibold text-content mb-2">Log Daily</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                Log workouts, nutrition, sleep, and water — one entry per day per type.
              </p>
            </div>
            <div className="card p-6 text-center">
              <div className="text-gain text-2xl mb-3" aria-hidden="true">🔥</div>
              <h3 className="font-semibold text-content mb-2">Build Streaks</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                Log every day to build your streak. Earn badges at 3, 7, 14, 30, 90, and 365 days.
              </p>
            </div>
            <div className="card p-6 text-center">
              <div className="text-accent text-2xl mb-3" aria-hidden="true">🏆</div>
              <h3 className="font-semibold text-content mb-2">Climb Leaderboard</h3>
              <p className="text-muted text-[13px] leading-relaxed">
                See how you rank against other members. Weekly totals, anonymous ranks.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-bg">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-surface-2 rounded-full">
            <span className="text-muted text-sm">Free forever</span>
            <span className="text-muted text-sm">·</span>
            <span className="text-muted text-sm">No app store needed</span>
            <span className="text-muted text-sm">·</span>
            <span className="text-muted text-sm">Google sign-in only</span>
          </div>
        </div>
      </section>
    </main>
  )
}