import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { detectTimezone } from '../lib/timezone'
import { Button, Card } from '../components/ui'
import type { LeaderboardEntry } from '../lib/types'

type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[]
  weekStart: string
  weekEnd: string
  timezone: string
}

const MEDALS = ['🥇', '🥈', '🥉']

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function Leaderboard() {
  const { user } = useAuth()
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = () => {
    setLoading(true)
    api.get<LeaderboardResponse>(`/fitness/leaderboard?tz=${encodeURIComponent(detectTimezone())}`)
      .then((d) => {
        setData(d)
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading leaderboard">
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-72 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <p className="text-[13px] text-muted">Failed to load the leaderboard.</p>
        <Button variant="secondary" className="mt-3" onClick={load}>Try again</Button>
      </Card>
    )
  }

  const ranked = data.leaderboard.filter((e) => (e.workout_minutes ?? 0) > 0)
  const myIndex = user ? ranked.findIndex((e) => e.id === user.id) : -1
  const myEntry = myIndex >= 0 ? ranked[myIndex] : null
  const weekLabel = `${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}`

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-muted">Your rank</p>
            {myEntry ? (
              <p className="mt-1 flex items-baseline gap-2">
                <span className="num text-2xl font-semibold text-accent">#{myIndex + 1}</span>
                <span className="text-[13px] text-muted">
                  with <span className="num text-content">{myEntry.workout_minutes}</span> workout minutes this week
                </span>
              </p>
            ) : (
              <p className="mt-1 text-[13px] text-muted">
                {user
                  ? "Log a workout to enter this week's rankings."
                  : 'Sign in to see where you stand.'}
              </p>
            )}
          </div>
          {user && !myEntry && (
            <Link to="/log" className="btn-secondary btn-sm">Log a workout</Link>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-semibold">This Week&apos;s Leaderboard</h1>
          <p className="text-[12px] text-muted">{weekLabel} · Workout minutes</p>
        </div>
        {ranked.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-3xl" aria-hidden="true">🏁</p>
            <p className="mt-2 text-[13px] text-muted">
              No workouts logged this week yet — be the first!
            </p>
            <Link to="/log" className="btn-primary mt-4">Log a workout</Link>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line px-3 pb-2">
            {ranked.slice(0, 20).map((entry, i) => {
              const isMe = user ? entry.id === user.id : false
              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between gap-2 px-2 py-2.5 ${isMe ? 'rounded-lg bg-accent/5' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="flex w-8 shrink-0 justify-center">
                      {i < 3 ? (
                        <span className="text-lg" aria-label={`Rank ${i + 1}`}>{MEDALS[i]}</span>
                      ) : (
                        <span className="num text-[13px] text-muted">#{i + 1}</span>
                      )}
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full" />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] text-muted">
                          {(entry.username || '?').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate text-[13px] font-medium text-content">
                        {entry.username || 'Anonymous'}
                      </span>
                      {isMe && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[13px] text-muted">{entry.workout_minutes}m</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
