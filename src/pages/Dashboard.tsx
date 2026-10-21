import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { detectTimezone } from '../lib/timezone'
import { useEntitlement } from '../lib/useEntitlement'
import { Button, Card } from '../components/ui'
import { ScanFoodModal } from '../components/food/ScanFoodModal'
import { TimezoneModal } from '../components/food/TimezoneModal'
import { MacroBars } from '../components/nutrition/MacroBars'
import { MacroTargetsModal } from '../components/nutrition/MacroTargetsModal'
import { HabitTracker } from '../components/habits/HabitTracker'
import { EditLogModal } from '../components/EditLogModal'
import type {
  Badge,
  FitnessGoal,
  FitnessLog,
  FitnessProfile,
  MacroTargets,
  MacroTotals,
  Streak,
} from '../lib/types'

const TYPE_META: Record<string, { label: string; icon: string }> = {
  workout: { label: 'Workout', icon: '💪' },
  nutrition: { label: 'Nutrition', icon: '🍎' },
  sleep: { label: 'Sleep', icon: '😴' },
  water: { label: 'Water', icon: '💧' },
  custom: { label: 'Custom', icon: '✏️' },
}

const TOTAL_BADGES = 8
const SEEN_BADGES_KEY = 'fitness_seen_badges'
const WELCOME_LOG_ACTIVITY = 'Welcome to fitness.hasit.in'

const GOAL_LABELS: Record<string, string> = {
  workout: 'Move more',
  nutrition: 'Eat well',
  water: 'Hydrate',
  sleep: 'Sleep well',
  custom: 'Your focus',
}

function goalPeriodLabel(period: string): string {
  if (period === 'week') return 'This week'
  if (period === 'month') return 'This month'
  return 'Today'
}

function logSummary(log: FitnessLog): string {
  if (log.type === 'sleep') {
    const hours = log.hours ?? log.duration_min
    return hours != null ? `${hours}h` : ''
  }
  if (log.duration_min != null) return `${log.duration_min} min`
  if (log.type === 'nutrition' && log.calories != null) return `${log.calories} kcal`
  if (log.type === 'water' && log.water_ml != null) return `${log.water_ml} ml`
  return ''
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading dashboard">
      <div className="h-48 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  )
}

export default function Dashboard() {
  const { user, loading } = useAuth()
  const entitlement = useEntitlement(user?.id)
  const [logs, setLogs] = useState<FitnessLog[] | null>(null)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const [profile, setProfile] = useState<FitnessProfile | null>(null)
  const [goals, setGoals] = useState<FitnessGoal[]>([])
  const [todayDate, setTodayDate] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [newBadges, setNewBadges] = useState<Badge[]>([])
  const [scanOpen, setScanOpen] = useState(false)
  const [scanTierNotice, setScanTierNotice] = useState(false)
  const [scanToast, setScanToast] = useState<{ calories: number; scanId: string } | null>(null)
  const [undoingMeal, setUndoingMeal] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [timezoneOpen, setTimezoneOpen] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)
  const [targets, setTargets] = useState<MacroTargets | null>(null)
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<FitnessLog | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    const detected = detectTimezone()
    try {
      const [logsData, streakData, badgeData, profileData, goalData] = await Promise.all([
        api.get<{ logs: FitnessLog[]; date: string; timezone: string; targets: MacroTargets }>(
          `/fitness/log/today?tz=${encodeURIComponent(detected)}`,
        ),
        api.get<{ streaks: Streak | null }>('/fitness/streaks'),
        api.get<{ badges: Badge[] }>('/fitness/badges'),
        api.get<FitnessProfile>(`/fitness/profile?tz=${encodeURIComponent(detected)}`),
        api.get<{ goals: FitnessGoal[] }>(`/fitness/goals?tz=${encodeURIComponent(detected)}`),
      ])
      setLogs(logsData.logs)
      setTodayDate(logsData.date)
      setTargets(logsData.targets)
      setStreak(streakData.streaks ?? null)
      setBadges(badgeData.badges)
      setProfile(profileData)
      setGoals(goalData.goals)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [user])

  useEffect(() => {
    if (user && !loading) {
      void loadData()
    }
  }, [user, loading, loadData])

  useEffect(() => {
    if (!badges) return
    try {
      const stored = window.localStorage.getItem(SEEN_BADGES_KEY)
      const codes = badges.map((b) => b.badge_code)
      if (stored === null) {
        window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(codes))
        return
      }
      const seen = new Set<string>(JSON.parse(stored) as string[])
      const fresh = badges.filter((b) => !seen.has(b.badge_code))
      if (fresh.length > 0) {
        setNewBadges(fresh)
        window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify([...seen, ...codes]))
      }
    } catch {
      // Ignore malformed local storage — celebrations are non-critical.
    }
  }, [badges])

  if (loading) return <DashboardSkeleton />
  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to see your progress.</p>
        <div className="mt-4 flex justify-center gap-3">
          <Link to="/login"><Button>Sign in with Google</Button></Link>
        </div>
      </Card>
    )
  }

  const currentStreak = streak?.current_streak ?? 0
  const longestStreak = streak?.longest_streak ?? 0
  const todayLogs = (logs ?? []).filter((log) => log.activity !== WELCOME_LOG_ACTIVITY)
  const loggedToday = todayLogs.length > 0
  const atRisk = currentStreak > 0 && !loggedToday
  const unlockedCount = badges?.length ?? 0
  const today = todayDate
    ? new Date(`${todayDate}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : ''
  const macroTotals = todayLogs.reduce<MacroTotals>(
    (sum, log) => {
      if (log.type !== 'nutrition') return sum
      return {
        calories: sum.calories + (log.calories ?? 0),
        protein_g: sum.protein_g + (log.protein_g ?? 0),
        carbs_g: sum.carbs_g + (log.carbs_g ?? 0),
        fat_g: sum.fat_g + (log.fat_g ?? 0),
      }
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  )
  const focusGoal = goals[0]
  const focusProgress = focusGoal?.progress ?? focusGoal?.current ?? 0
  const focusPct =
    focusGoal && focusGoal.target > 0
      ? Math.min(100, Math.round((focusProgress / focusGoal.target) * 100))
      : 0

  const confirmDetectedTimezone = async () => {
    if (!profile?.timezone) return
    setSavingTimezone(true)
    try {
      await api.put('/fitness/profile', { timezone: profile.timezone })
      setProfile({ ...profile, confirmed: true, detected: null })
      void loadData()
    } catch {
      // Leave the prompt visible so the user can retry.
    } finally {
      setSavingTimezone(false)
    }
  }

  const handleTimezoneSaved = (timezone: string) => {
    setProfile((previous) => (previous ? { ...previous, timezone, confirmed: true, detected: null } : previous))
    void loadData()
  }

  const handleMealLogged = (meal: { calories: number; scanId: string }) => {
    setScanToast(meal)
    setUndoError(null)
    void loadData()
  }

  const undoMeal = async () => {
    if (!scanToast || undoingMeal) return
    setUndoingMeal(true)
    setUndoError(null)
    try {
      await api.post('/fitness/log/scan/undo', { scan_id: scanToast.scanId })
      setScanToast(null)
      void loadData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setScanToast(null)
        void loadData()
      } else {
        setUndoError('Could not undo that meal. Please try again.')
      }
    } finally {
      setUndoingMeal(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={`${atRisk ? 'hero-glow-warn' : 'hero-glow'} overflow-hidden rounded-xl border border-line p-5 sm:p-6`}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] uppercase tracking-wide text-muted">{today}</p>
            <button
              type="button"
              onClick={() => setTimezoneOpen(true)}
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted transition-colors hover:text-content"
            >
              <span>Timezone: {profile?.timezone ?? 'UTC'}</span>
              <span className="text-muted/70">Change</span>
            </button>
            <h1 className="mt-1 text-xl font-semibold">
              {atRisk
                ? 'Your streak is at risk'
                : loggedToday
                  ? `Nice work, ${user.username}`
                  : 'Ready when you are'}
            </h1>
            <p className="mt-1 max-w-md text-[13px] text-muted">
              {atRisk
                ? `Log an activity today to keep your ${currentStreak}-day streak alive.`
                : loggedToday
                  ? "You've logged today. Keep the momentum going."
                  : 'Log your first activity of the day to start a streak.'}
            </p>

            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] ${
                loggedToday
                  ? 'border-gain/30 bg-gain/10 text-gain'
                  : 'border-line bg-surface-2 text-muted'
              }`}
            >
              <span aria-hidden="true">{loggedToday ? '✓' : '○'}</span>
              Daily quest: log at least one activity
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link to="/log"><Button size="lg">Log activity</Button></Link>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  if (entitlement && !entitlement.features.ai_tools) {
                    setScanTierNotice(true)
                    return
                  }
                  setScanOpen(true)
                }}
              >
                Scan food
              </Button>
              <Link
                to="/achievements"
                className="text-[13px] text-muted transition-colors hover:text-content"
              >
                View badges →
              </Link>
            </div>
            {(scanTierNotice || (entitlement !== null && !entitlement.features.ai_tools)) && (
              <p role="status" className="mt-2 max-w-md text-[12px] text-muted">
                AI photo and text estimates are part of Plus. Ask your coach to enable access;
                manual logging and the food database stay free.
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 sm:flex-col sm:gap-1">
            <div
              className={`flex h-28 w-28 flex-col items-center justify-center rounded-full border ${
                atRisk
                  ? 'border-warn/40 bg-warn/5'
                  : currentStreak > 0
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-line bg-surface-2'
              }`}
            >
              <span className="text-3xl" aria-hidden="true">🔥</span>
              <span className="num text-2xl font-bold leading-tight">{currentStreak}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">day streak</span>
            </div>
            <p className="text-[11px] text-muted">Longest: {longestStreak}d</p>
          </div>
        </div>
      </section>

      {profile && !profile.confirmed && profile.timezone && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <div>
            <p className="text-[13px] font-medium">Is {profile.timezone} your timezone?</p>
            <p className="text-[12px] text-muted">
              Detected from this device. Logs, streaks, and weekly totals roll over at midnight there.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTimezoneOpen(true)}>
              Change
            </Button>
            <Button size="sm" onClick={() => void confirmDetectedTimezone()} loading={savingTimezone}>
              Yes, use it
            </Button>
          </div>
        </div>
      )}

      <MacroBars totals={macroTotals} targets={targets} onEditTargets={() => setTargetsOpen(true)} />

      {focusGoal && (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-muted">Your focus</p>
              <p className="mt-0.5 text-[15px] font-semibold">
                {GOAL_LABELS[focusGoal.type] ?? 'Your focus'}
              </p>
            </div>
            <p className="num text-[13px]">
              <span className="font-semibold">{focusProgress}</span>
              <span className="text-muted">
                {' / '}
                {focusGoal.target} {focusGoal.unit ?? ''}
              </span>
            </p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={focusGoal.target}
            aria-valuenow={Math.min(focusProgress, focusGoal.target)}
            aria-label={`${GOAL_LABELS[focusGoal.type] ?? 'Goal'} progress`}
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${focusPct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {goalPeriodLabel(focusGoal.period)} - {focusPct}% of target
          </p>
        </Card>
      )}

      <HabitTracker onChanged={() => void loadData()} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Today&apos;s logs</p>
          <p className="num mt-1 text-2xl font-semibold">{todayLogs.length}</p>
          <p className="text-[12px] text-muted">
            {todayLogs.length === 1 ? 'entry logged' : 'entries logged'} today
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Badges unlocked</p>
          <p className="num mt-1 text-2xl font-semibold">
            {unlockedCount}
            <span className="text-[13px] font-normal text-muted">/{TOTAL_BADGES}</span>
          </p>
          <Link to="/achievements" className="text-[12px] text-accent hover:underline">
            See achievements →
          </Link>
        </Card>

        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Longest streak</p>
          <p className="num mt-1 text-2xl font-semibold">
            {longestStreak}
            <span className="text-[13px] font-normal text-muted"> days</span>
          </p>
          <p className="text-[12px] text-muted">Personal best</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold text-content">Today</h2>
          <Link to="/log" className="text-accent hover:underline text-[13px]">Log activity →</Link>
        </div>
        {logs === null ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {loadError ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-muted">Failed to load your logs.</p>
                <Button variant="secondary" className="mt-3" onClick={() => void loadData()}>
                  Try again
                </Button>
              </div>
            ) : (
              [0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
              ))
            )}
          </div>
        ) : todayLogs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-3xl" aria-hidden="true">🎯</p>
            <p className="mt-2 text-[13px] text-muted">
              Nothing logged today yet — your streak starts with one entry.
            </p>
            <Link to="/log" className="btn-primary mt-4">Log your first activity</Link>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {todayLogs.map((log) => {
              const meta = TYPE_META[log.type] ?? { label: log.type, icon: '•' }
              const summary = logSummary(log)
              return (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base"
                    aria-hidden="true"
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{meta.label}</p>
                    <p className="truncate text-[12px] text-muted">{log.activity || 'No details'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {summary && <span className="num text-[13px] text-muted">{summary}</span>}
                    <button
                      type="button"
                      onClick={() => setEditingLog(log)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-content"
                      aria-label={`Edit ${meta.label} log`}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {(newBadges.length > 0 || scanToast !== null) && (
        <div className="toast-container flex flex-col gap-2">
          {scanToast !== null && (
            <div className="flex items-center gap-3 rounded-xl border border-gain/40 bg-surface px-4 py-3 shadow-lg">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">Meal logged</p>
                <p className="truncate text-[12px] text-muted">
                  About {scanToast.calories.toLocaleString('en-US')} kcal added to today.
                </p>
                {undoError && <p className="mt-1 text-[11px] text-loss">{undoError}</p>}
              </div>
              <button
                type="button"
                onClick={() => void undoMeal()}
                disabled={undoingMeal}
                className="text-[12px] font-medium text-accent hover:underline disabled:opacity-40"
              >
                {undoingMeal ? 'Undoing…' : 'Undo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScanToast(null)
                  setUndoError(null)
                }}
                className="text-muted hover:text-content"
                aria-label="Dismiss meal notification"
              >
                ✕
              </button>
            </div>
          )}
          {newBadges.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-surface px-4 py-3 shadow-lg">
              <span className="text-2xl" aria-hidden="true">{newBadges[0].icon ?? '🏆'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">Badge unlocked!</p>
                <p className="truncate text-[12px] text-muted">
                  {newBadges.map((b) => b.name ?? b.badge_code).join(', ')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewBadges([])}
                className="text-muted hover:text-content"
                aria-label="Dismiss badge notification"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <ScanFoodModal open={scanOpen} onClose={() => setScanOpen(false)} onLogged={handleMealLogged} />
      {targetsOpen && (
        <MacroTargetsModal
          targets={targets}
          onClose={() => setTargetsOpen(false)}
          onSaved={(saved) => {
            setTargets(saved)
          }}
        />
      )}
      {editingLog && (
        <EditLogModal
          log={editingLog}
          today={todayDate ?? editingLog.recorded_at}
          onClose={() => setEditingLog(null)}
          onSaved={() => {
            setEditingLog(null)
            void loadData()
          }}
        />
      )}
      <TimezoneModal
        open={timezoneOpen}
        current={profile?.timezone ?? detectTimezone()}
        onClose={() => setTimezoneOpen(false)}
        onSaved={handleTimezoneSaved}
      />
    </div>
  )
}
