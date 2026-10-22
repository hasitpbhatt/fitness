import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { addDays, detectTimezone, localDate } from '../lib/timezone'
import { useEntitlement } from '../lib/useEntitlement'
import { Button, Card } from '../components/ui'
import { Alert, EmptyState, Skeleton } from '../components/feedback'
import { Icon } from '../components/icons'
import { ScanFoodModal } from '../components/food/ScanFoodModal'
import { EditLogModal } from '../components/EditLogModal'
import type { FitnessLog } from '../lib/types'

type ActivityType = 'workout' | 'nutrition' | 'sleep' | 'water' | 'custom'

const ACTIVITY_TYPES: { id: ActivityType; label: string; icon: string }[] = [
  { id: 'workout', label: 'Workout', icon: '💪' },
  { id: 'nutrition', label: 'Nutrition', icon: '🍎' },
  { id: 'sleep', label: 'Sleep', icon: '😴' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'custom', label: 'Custom', icon: '✏️' },
]

export default function Log() {
  const { user, loading: authLoading } = useAuth()
  const entitlement = useEntitlement(user?.id)
  const [type, setType] = useState<ActivityType>('workout')
  const [activity, setActivity] = useState('')
  const [durationMin, setDurationMin] = useState<string>('')
  const [calories, setCalories] = useState<string>('')
  const [waterMl, setWaterMl] = useState<string>('')
  const [protein, setProtein] = useState<string>('')
  const [carbs, setCarbs] = useState<string>('')
  const [fat, setFat] = useState<string>('')
  const [hours, setHours] = useState<string>('')
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const [busy, setBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [undoScanId, setUndoScanId] = useState<string | null>(null)
  const [undoingMeal, setUndoingMeal] = useState(false)
  const [dayLogs, setDayLogs] = useState<FitnessLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [editingLog, setEditingLog] = useState<FitnessLog | null>(null)

  const timezone = detectTimezone()
  const today = localDate(timezone)
  const yesterday = addDays(today, -1)
  const targetDate = day === 'today' ? today : yesterday

  // The entries for the selected day are shown right here, so a member never
  // has to leave this page to find out what they already logged.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLogsLoading(true)
    setLogsError(null)
    api
      .get<{ logs: FitnessLog[] }>(`/fitness/logs?start=${targetDate}&end=${targetDate}`)
      .then((data) => {
        if (cancelled) return
        setDayLogs(data.logs)
        setLogsLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setDayLogs([])
        setLogsError('Could not load your entries.')
        setLogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, targetDate, refresh])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setAlreadyLogged(false)
    try {
      await api.post('/fitness/log', {
        type,
        activity: activity.trim(),
        duration_min: durationMin ? parseInt(durationMin) : null,
        calories: calories ? parseInt(calories) : null,
        water_ml: waterMl ? parseInt(waterMl) : null,
        protein_g: protein ? parseFloat(protein) : null,
        carbs_g: carbs ? parseFloat(carbs) : null,
        fat_g: fat ? parseFloat(fat) : null,
        hours: hours ? parseFloat(hours) : null,
        ...(day === 'yesterday' ? { date: yesterday } : {}),
        timezone,
      })
      setMessage({ kind: 'success', text: `Logged ${day === 'yesterday' ? 'for yesterday' : 'successfully'}!` })
      setRefresh((value) => value + 1)
      setActivity('')
      setDurationMin('')
      setCalories('')
      setWaterMl('')
      setProtein('')
      setCarbs('')
      setFat('')
      setHours('')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'already_logged_today') {
        const label = ACTIVITY_TYPES.find((entry) => entry.id === type)?.label ?? 'That activity'
        setAlreadyLogged(true)
        setMessage({
          kind: 'error',
          text:
            day === 'yesterday'
              ? `${label} is already logged for yesterday. Edit it in the entries below.`
              : `${label} is already logged for today. Edit it in the entries below, or use "Scan food" to add a meal.`,
        })
      } else {
        setMessage({
          kind: 'error',
          text: err instanceof ApiError ? err.message : 'Failed to log activity.',
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const undoMeal = async () => {
    if (!undoScanId || undoingMeal) return
    setUndoingMeal(true)
    try {
      await api.post('/fitness/log/scan/undo', { scan_id: undoScanId })
      setUndoScanId(null)
      setMessage({ kind: 'success', text: "Meal removed from today's total." })
      setRefresh((value) => value + 1)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setUndoScanId(null)
        setMessage({ kind: 'success', text: 'That meal was already removed.' })
      } else {
        setMessage({ kind: 'error', text: 'Could not undo that meal. Please try again.' })
      }
    } finally {
      setUndoingMeal(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading">
        <Skeleton className="h-64 w-full" label="Loading the log form" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-content">Log activity</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to track your day.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">
          Sign in with Google
        </Link>
      </Card>
    )
  }

  const openScan = () => {
    if (entitlement && !entitlement.features.ai_tools) {
      setMessage({
        kind: 'error',
        text: 'AI food scan is part of Plus. Ask your coach to enable access, or add the meal manually below.',
      })
      return
    }
    setScanOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-content">
              Log {day === 'yesterday' ? 'Yesterday' : 'Today'}
            </h1>
            <p className="mt-0.5 text-[13px] text-muted">One entry per activity type per day.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={openScan}>
            <Icon name="camera" size={16} />
            Scan food
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-4">
          <div
            className="mb-4 inline-flex rounded-lg border border-line bg-surface-2 p-1"
            role="group"
            aria-label="Log date"
          >
            {(['today', 'yesterday'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDay(option)}
                aria-pressed={day === option}
                className={`tap rounded-md px-3 text-[12px] font-medium transition-colors ${
                  day === option ? 'bg-accent text-white' : 'text-muted hover:text-content'
                }`}
              >
                {option === 'today' ? 'Today' : 'Yesterday'}
              </button>
            ))}
          </div>

          {/* Type selector - scrolls sideways on a narrow phone, and the row
              is padded so the last option is visibly half-cut rather than
              hiding the fact that more exists. */}
          <div className="scroll-x scroll-x-pad mb-4">
            {ACTIVITY_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                aria-pressed={type === t.id}
                className={`flex min-h-[72px] w-[74px] flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2 transition-colors ${
                  type === t.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-muted hover:bg-surface-2 hover:text-content'
                }`}
              >
                <span className="text-xl" aria-hidden="true">
                  {t.icon}
                </span>
                <span className="text-[12px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="log-activity" className="mb-1 block text-[12px] font-medium text-content">
                Activity
              </label>
              <input
                id="log-activity"
                type="text"
                placeholder="e.g. 30 min walk, salad, 8 hours, 500ml"
                className="input"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
            </div>

            {type === 'workout' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="log-duration" className="mb-1 block text-[12px] font-medium text-content">
                    Duration (min)
                  </label>
                  <input
                    id="log-duration"
                    type="number"
                    inputMode="numeric"
                    className="input"
                    value={durationMin}
                    onChange={(e) => setDurationMin(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="log-calories" className="mb-1 block text-[12px] font-medium text-content">
                    Calories
                  </label>
                  <input
                    id="log-calories"
                    type="number"
                    inputMode="numeric"
                    className="input"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                  />
                </div>
              </div>
            )}

            {type === 'nutrition' && (
              <>
                <div>
                  <label htmlFor="log-nutrition-calories" className="mb-1 block text-[12px] font-medium text-content">
                    Calories
                  </label>
                  <input
                    id="log-nutrition-calories"
                    type="number"
                    inputMode="numeric"
                    className="input"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {(
                    [
                      ['Protein (g)', protein, setProtein, 'log-protein'],
                      ['Carbs (g)', carbs, setCarbs, 'log-carbs'],
                      ['Fat (g)', fat, setFat, 'log-fat'],
                    ] as const
                  ).map(([label, value, setter, id]) => (
                    <div key={id}>
                      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-content">
                        {label}
                      </label>
                      <input
                        id={id}
                        type="number"
                        inputMode="decimal"
                        className="input px-2"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {type === 'sleep' && (
              <div>
                <label htmlFor="log-hours" className="mb-1 block text-[12px] font-medium text-content">
                  Hours
                </label>
                <input
                  id="log-hours"
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  className="input"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
            )}

            {type === 'water' && (
              <div>
                <label htmlFor="log-water" className="mb-1 block text-[12px] font-medium text-content">
                  Water (ml)
                </label>
                <input
                  id="log-water"
                  type="number"
                  inputMode="numeric"
                  className="input"
                  value={waterMl}
                  onChange={(e) => setWaterMl(e.target.value)}
                />
              </div>
            )}
          </div>

          {message && (
            <div className="mt-4">
              <Alert
                tone={message.kind === 'success' ? 'success' : 'danger'}
                action={
                  alreadyLogged && day === 'today' ? (
                    <Link to="/dashboard" className="text-[12px] font-medium text-accent hover:underline">
                      Dashboard
                    </Link>
                  ) : undoScanId ? (
                    <button
                      type="button"
                      onClick={() => void undoMeal()}
                      disabled={undoingMeal}
                      className="tap rounded px-2 text-[12px] font-medium text-accent hover:underline disabled:opacity-40"
                    >
                      {undoingMeal ? 'Undoing…' : 'Undo'}
                    </button>
                  ) : undefined
                }
              >
                {message.text}
              </Alert>
            </div>
          )}

          <Button type="submit" className="mt-5 w-full" loading={busy}>
            {day === 'yesterday' ? 'Log to yesterday' : 'Log activity'}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-content">
            {day === 'yesterday' ? "Yesterday's entries" : "Today's entries"}
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Edit or remove an entry while it is still in the 7-day window.
          </p>
        </div>

        {logsLoading ? (
          <div className="flex flex-col gap-2 p-4" role="status" aria-label="Loading entries">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : logsError ? (
          <div className="p-4">
            <Alert tone="danger">{logsError}</Alert>
          </div>
        ) : dayLogs.length === 0 ? (
          <EmptyState
            icon="plus-circle"
            title={day === 'yesterday' ? 'Nothing logged yesterday' : 'Nothing logged yet today'}
            description={
              day === 'yesterday'
                ? 'Your streak starts with one entry — even a short one counts.'
                : 'Your streak starts with one entry — even a short one counts.'
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {dayLogs.map((log) => {
              const meta = ACTIVITY_TYPES.find((entry) => entry.id === log.type)
              const summary =
                log.calories != null
                  ? `${log.calories.toLocaleString('en-US')} kcal`
                  : log.water_ml != null
                    ? `${log.water_ml.toLocaleString('en-US')} ml`
                    : log.hours != null
                      ? `${log.hours}h`
                      : log.duration_min != null
                        ? `${log.duration_min} min`
                        : ''
              return (
                <li key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base"
                    aria-hidden="true"
                  >
                    {meta?.icon ?? ''}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-content">{meta?.label ?? log.type}</p>
                    <p className="truncate text-[12px] text-muted">{log.activity || 'No details'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {summary && <span className="num text-[13px] text-muted">{summary}</span>}
                    <button
                      type="button"
                      onClick={() => setEditingLog(log)}
                      className="tap flex items-center justify-center rounded-md text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-content"
                      aria-label={`Edit ${meta?.label ?? log.type} log`}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editingLog && (
        <EditLogModal
          log={editingLog}
          today={today}
          onClose={() => setEditingLog(null)}
          onSaved={() => {
            setEditingLog(null)
            setRefresh((value) => value + 1)
          }}
        />
      )}

      <ScanFoodModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onLogged={(meal) => {
          setMessage({
            kind: 'success',
            text: `Meal logged — about ${meal.calories.toLocaleString('en-US')} kcal added to today.`,
          })
          setUndoScanId(meal.scanId)
          setType('nutrition')
          setRefresh((value) => value + 1)
        }}
      />
    </div>
  )
}
