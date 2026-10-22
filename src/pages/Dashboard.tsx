import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { detectTimezone } from '../lib/timezone'
import { useEntitlement } from '../lib/useEntitlement'
import { Button, Card } from '../components/ui'
import { Icon } from '../components/icons'
import { useToast } from '../lib/useToast'
import { useLocale } from '../i18n'
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
  const { showToast } = useToast()
  const { t } = useLocale()
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
  // A calorie goal is a ceiling, so it is shown as a budget with a remainder
  // rather than as progress towards a maximum.
  const isCalorieGoal = focusGoal?.type === 'nutrition'
  const focusRemaining = isCalorieGoal ? focusGoal.target - focusProgress : 0

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
    void loadData()
    showToast(`About ${meal.calories.toLocaleString('en-US')} kcal added to today.`, {
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          void undoMeal(meal.scanId)
        },
      },
    })
  }

  const undoMeal = async (scanId: string) => {
    try {
      await api.post('/fitness/log/scan/undo', { scan_id: scanId })
      void loadData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        void loadData()
      } else {
        showToast('Could not undo that meal. Please try again.', { tone: 'danger' })
      }
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
                ? t('dash.streakAtRisk')
                : loggedToday
                  ? t('dash.niceWork', { name: user.username })
                  : t('dash.readyWhen')}
            </h1>
            <p className="mt-1 max-w-md text-[13px] text-muted">
              {atRisk
                ? t('dash.streakAtRiskBody', { count: currentStreak })
                : loggedToday
                  ? t('dash.niceWorkBody')
                  : t('dash.readyWhenBody')}
            </p>

            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] ${
                loggedToday
                  ? 'border-gain/30 bg-gain/10 text-gain'
                  : 'border-line bg-surface-2 text-muted'
              }`}
            >
              <span aria-hidden="true">{loggedToday ? '✓' : '○'}</span>
              {t('dash.dailyQuest')}
            </div>

            {/* The two things a member actually does live here, so they get
                full-width buttons on a phone rather than a cramped wrapped row. */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Link to="/log" className="block w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  <Icon name="plus-circle" size={18} />
                  {t('dash.logActivity')}
                </Button>
              </Link>
              <Button
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (entitlement && !entitlement.features.ai_tools) {
                    setScanTierNotice(true)
                    return
                  }
                  setScanOpen(true)
                }}
              >
                <Icon name="camera" size={18} />
                {t('dash.scanFood')}
              </Button>
              <Link
                to="/achievements"
                className="tap flex items-center justify-center text-[13px] text-muted transition-colors hover:text-content sm:justify-start"
              >
                {t('dash.viewBadges')}
                <Icon name="chevron-right" size={15} />
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
              <p className="text-[13px] font-medium">
                {t('dash.timezoneQuestion', { zone: profile.timezone })}
              </p>
            <p className="text-[12px] text-muted">
              Detected from this device. Logs, streaks, and weekly totals roll over at midnight there.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setTimezoneOpen(true)}>
              Change
            </Button>
            <Button size="sm" onClick={() => void confirmDetectedTimezone()} loading={savingTimezone}>
                {t('dash.yesUseThis')}
              </Button>
          </div>
        </div>
      )}

      <MacroBars totals={macroTotals} targets={targets} onEditTargets={() => setTargetsOpen(true)} />

      {focusGoal && (
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-muted">{t('dash.yourFocus')}</p>
              <p className="mt-0.5 text-[15px] font-semibold text-content">
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
          {isCalorieGoal ? (
            /* A calorie target is a ceiling, not something to fill up, so it
               reads as a budget with what is left - never as a bar that
               rewards eating more. */
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    focusPct > 100 ? 'bg-warn' : 'bg-accent'
                  }`}
                  style={{ width: `${Math.min(100, focusPct)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {focusRemaining > 0
                  ? `${focusRemaining.toLocaleString('en-US')} kcal left today`
                  : `${Math.abs(focusRemaining).toLocaleString('en-US')} kcal over your daily target`}
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </Card>
      )}

      <HabitTracker onChanged={() => void loadData()} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Today&apos;s logs</p>
          <p className="num mt-1 text-2xl font-semibold">{todayLogs.length}</p>
          <p className="text-[12px] text-muted">
            {todayLogs.length === 1 ? t('dash.entryLogged') : t('dash.entriesLogged')}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">{t('dash.badgesUnlocked')}</p>
          <p className="num mt-1 text-2xl font-semibold">
            {unlockedCount}
            <span className="text-[13px] font-normal text-muted">/{TOTAL_BADGES}</span>
          </p>
          <Link to="/achievements" className="text-[12px] text-accent hover:underline">
            {t('dash.seeAchievements')} →
          </Link>
        </Card>

        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">{t('dash.longestStreak')}</p>
          <p className="num mt-1 text-2xl font-semibold">
            {longestStreak}
            <span className="text-[13px] font-normal text-muted"> days</span>
          </p>
          <p className="text-[12px] text-muted">{t('dash.personalBest')}</p>
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
                <p className="text-[13px] text-muted">{t('dash.loadFailed')}</p>
                <Button variant="secondary" className="mt-3" onClick={() => void loadData()}>
                  {t('dash.tryAgain')}
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
            <p className="mt-2 text-[13px] text-muted">{t('dash.emptyBody')}</p>
            <Link to="/log" className="btn-primary mt-4">{t('dash.logFirst')}</Link>
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

      {newBadges.length > 0 && (
        <div className="toast-container flex flex-col items-stretch gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-warn/30 bg-surface px-3 py-2.5 text-[12px] shadow-lg">
            <span className="text-xl" aria-hidden="true">{newBadges[0].icon ?? '🏆'}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-content">Badge unlocked!</p>
              <p className="truncate text-muted">
                {newBadges.map((b) => b.name ?? b.badge_code).join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewBadges([])}
              className="tap shrink-0 rounded p-1 text-muted hover:text-content"
              aria-label="Dismiss badge notification"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
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
