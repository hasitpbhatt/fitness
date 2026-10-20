import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card } from '../components/ui'
import type { Badge, Streak } from '../lib/types'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

type BadgeDef = {
  code: string
  name: string
  icon: string
  rarity: Rarity
  threshold: number
  condition: string
}

const BADGES: BadgeDef[] = [
  { code: 'first_log', name: 'First Step', icon: '🥇', rarity: 'common', threshold: 1, condition: 'Log your first activity' },
  { code: 'streak_3', name: 'Three Day Streak', icon: '🔥', rarity: 'common', threshold: 3, condition: 'Log 3 days in a row' },
  { code: 'streak_7', name: 'One Week Streak', icon: '🎯', rarity: 'rare', threshold: 7, condition: 'Log 7 days in a row' },
  { code: 'streak_14', name: 'Two Week Streak', icon: '🏆', rarity: 'rare', threshold: 14, condition: 'Log 14 days in a row' },
  { code: 'streak_30', name: 'One Month Streak', icon: '💎', rarity: 'epic', threshold: 30, condition: 'Log 30 days in a row' },
  { code: 'streak_60', name: 'Two Month Streak', icon: '👑', rarity: 'epic', threshold: 60, condition: 'Log 60 days in a row' },
  { code: 'streak_90', name: 'Three Month Streak', icon: '🏅', rarity: 'legendary', threshold: 90, condition: 'Log 90 days in a row' },
  { code: 'streak_365', name: 'One Year Streak', icon: '🌟', rarity: 'legendary', threshold: 365, condition: 'Log 365 days in a row' },
]

const RARITY: Record<Rarity, { card: string; text: string; label: string }> = {
  common: { card: 'border-line bg-surface', text: 'text-muted', label: 'Common' },
  rare: { card: 'border-accent/40 bg-accent/5', text: 'text-accent', label: 'Rare' },
  epic: { card: 'border-purple-400/40 bg-purple-400/5', text: 'text-purple-300', label: 'Epic' },
  legendary: { card: 'border-amber-400/40 bg-amber-400/5', text: 'text-amber-300', label: 'Legendary' },
}

function remainingLabel(def: BadgeDef, currentStreak: number, unlocked: boolean): string {
  if (unlocked) return ''
  if (def.code === 'first_log') return 'Log anything to earn it'
  const remaining = def.threshold - currentStreak
  if (remaining <= 0) return 'Log today to unlock'
  return `${remaining} more ${remaining === 1 ? 'day' : 'days'}`
}

export default function Achievements() {
  const { user, loading: authLoading } = useAuth()
  const [badges, setBadges] = useState<Badge[]>([])
  const [streak, setStreak] = useState<Streak | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [badgeData, streakData] = await Promise.all([
        api.get<{ badges: Badge[] }>('/fitness/badges'),
        api.get<{ streaks: Streak | null }>('/fitness/streaks'),
      ])
      setBadges(badgeData.badges)
      setStreak(streakData.streaks)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && !authLoading) {
      void load()
    }
  }, [user, authLoading, load])

  if (authLoading) {
    return <p className="py-12 text-center text-[13px] text-muted">Loading…</p>
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Achievements</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to start collecting badges.</p>
        <div className="mt-4 flex justify-center">
          <Link to="/login"><Button>Sign in with Google</Button></Link>
        </div>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading achievements">
        <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {BADGES.map((b) => (
            <div key={b.code} className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <p className="text-[13px] text-muted">Failed to load achievements.</p>
        <Button variant="secondary" className="mt-3" onClick={() => void load()}>Try again</Button>
      </Card>
    )
  }

  const unlockedByCode = new Map(badges.map((b) => [b.badge_code, b]))
  const currentStreak = streak?.current_streak ?? 0

  const nextUp = BADGES
    .filter((b) => !unlockedByCode.has(b.code))
    .sort((a, b) => a.threshold - b.threshold)[0]
  const progress = nextUp
    ? Math.min(100, Math.round((currentStreak / nextUp.threshold) * 100))
    : 100
  const remaining = nextUp ? Math.max(0, nextUp.threshold - currentStreak) : 0
  const unlockedCount = unlockedByCode.size
  const overallProgress = Math.round((unlockedCount / BADGES.length) * 100)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold">Achievements</h1>
              <p className="mt-1 text-[12px] text-muted">
                {unlockedCount} of {BADGES.length} badges unlocked
                {currentStreak > 0 ? ` · ${currentStreak}-day streak` : ''}
              </p>
            </div>
            <span className={`num text-[13px] ${unlockedCount > 0 ? 'text-accent' : 'text-muted'}`}>
              {overallProgress}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          {nextUp && (
            <div className="mt-5 rounded-lg border border-line bg-surface-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">{nextUp.icon}</span>
                  <div>
                    <p className="text-[13px] font-medium">Next up: {nextUp.name}</p>
                    <p className="text-[12px] text-muted">
                      {nextUp.code === 'first_log'
                        ? nextUp.condition
                        : remaining === 0
                          ? 'So close — log today to unlock it!'
                          : `${remaining} more ${remaining === 1 ? 'day' : 'days'} to unlock`}
                    </p>
                  </div>
                </div>
                <span className={`num text-[13px] ${RARITY[nextUp.rarity].text}`}>{progress}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {BADGES.map((def) => {
          const unlocked = unlockedByCode.get(def.code)
          const rarity = RARITY[def.rarity]
          return (
            <div
              key={def.code}
              className={`rounded-xl border p-4 text-center transition-colors ${rarity.card} ${unlocked ? '' : 'opacity-80'}`}
              title={unlocked ? `Unlocked ${new Date(unlocked.awarded_at).toLocaleDateString()}` : undefined}
            >
              <div className={`text-3xl ${unlocked ? '' : 'opacity-60 grayscale'}`} aria-hidden="true">
                {def.icon}
              </div>
              <h3 className="mt-2 text-[13px] font-medium">{def.name}</h3>
              <p className={`mt-0.5 text-[10px] uppercase tracking-wide ${rarity.text}`}>
                {rarity.label}
              </p>
              <p className="mt-1 text-[11px] text-muted">{def.condition}</p>
              {unlocked ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gain/10 px-2 py-0.5 text-[11px] font-medium text-gain">
                  ✓ Unlocked
                </span>
              ) : (
                <span className="mt-2 inline-block text-[11px] text-muted">
                  {remainingLabel(def, currentStreak, false)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
