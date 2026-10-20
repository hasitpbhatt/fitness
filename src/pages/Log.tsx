import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { addDays, detectTimezone, localDate } from '../lib/timezone'
import { Button, Card } from '../components/ui'
import { ScanFoodModal } from '../components/food/ScanFoodModal'
import { EditLogModal } from '../components/EditLogModal'
import type { FitnessLog } from '../lib/types'

type ActivityType = 'workout' | 'nutrition' | 'sleep' | 'water' | 'custom'

export default function Log() {
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
  const [yesterdayLogs, setYesterdayLogs] = useState<FitnessLog[]>([])
  const [refreshYesterday, setRefreshYesterday] = useState(0)
  const [editingLog, setEditingLog] = useState<FitnessLog | null>(null)

  const timezone = detectTimezone()
  const today = localDate(timezone)
  const yesterday = addDays(today, -1)

  useEffect(() => {
    if (day !== 'yesterday') return
    let cancelled = false
    api.get<{ logs: FitnessLog[] }>(`/fitness/logs?start=${yesterday}&end=${yesterday}`)
      .then((data) => {
        if (!cancelled) setYesterdayLogs(data.logs)
      })
      .catch(() => {
        if (!cancelled) setYesterdayLogs([])
      })
    return () => {
      cancelled = true
    }
  }, [day, yesterday, refreshYesterday])

  const activityTypes: { id: ActivityType; label: string; icon: string }[] = [
    { id: 'workout', label: 'Workout', icon: '💪' },
    { id: 'nutrition', label: 'Nutrition', icon: '🍎' },
    { id: 'sleep', label: 'Sleep', icon: '😴' },
    { id: 'water', label: 'Water', icon: '💧' },
    { id: 'custom', label: 'Custom', icon: '✏️' },
  ]

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
      if (day === 'yesterday') setRefreshYesterday((value) => value + 1)
      setActivity('')
      setDurationMin('')
      setCalories('')
      setWaterMl('')
      setProtein('')
      setCarbs('')
      setFat('')
      setHours('')
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'already_logged_today') {
        const label = activityTypes.find((entry) => entry.id === type)?.label ?? 'That activity'
        setAlreadyLogged(true)
        setMessage({
          kind: 'error',
          text:
            day === 'yesterday'
              ? `${label} is already logged for yesterday. Edit it in yesterday's entries below.`
              : `${label} is already logged for today. Open the dashboard to edit it, or use "Scan food" to add a meal.`,
        })
      } else {
        setMessage({ kind: 'error', text: err?.message || 'Failed to log activity.' })
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold">Log {day === 'yesterday' ? 'Yesterday' : 'Today'}</h1>
            <p className="text-[13px] text-muted mt-1">One entry per activity type per day.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)}>
            Scan food
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <div className="mb-4 inline-flex rounded-lg border border-line bg-surface-2 p-1" role="group" aria-label="Log date">
            {(['today', 'yesterday'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDay(option)}
                aria-pressed={day === option}
                className={`min-h-[36px] rounded-md px-3 text-[12px] font-medium transition-colors ${
                  day === option ? 'bg-accent text-white' : 'text-muted hover:text-content'
                }`}
              >
                {option === 'today' ? 'Today' : 'Yesterday'}
              </button>
            ))}
          </div>

          {/* Type selector */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {activityTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-2 px-3 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                  type === t.id
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-line text-muted hover:border-surface-2'
                }`}
              >
                <span aria-hidden="true">{t.icon}</span>
                <span className="text-[12px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-content mb-1">Activity</label>
              <input
                type="text"
                placeholder="e.g. 30 min walk, salad, 8 hours, 500ml"
                className="input w-full"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
            </div>

            {type === 'workout' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-content mb-1">Duration (min)</label>
                  <input type="number" className="input" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-content mb-1">Calories</label>
                  <input type="number" className="input" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
              </div>
            )}

            {type === 'nutrition' && (
              <>
                <div>
                  <label className="block text-[12px] font-medium text-content mb-1">Calories</label>
                  <input type="number" className="input" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-content mb-1">Protein (g)</label>
                    <input type="number" className="input" value={protein} onChange={(e) => setProtein(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-content mb-1">Carbs (g)</label>
                    <input type="number" className="input" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-content mb-1">Fat (g)</label>
                    <input type="number" className="input" value={fat} onChange={(e) => setFat(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {type === 'sleep' && (
              <div>
                <label className="block text-[12px] font-medium text-content mb-1">Hours</label>
                <input type="number" step="0.5" className="input" value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
            )}

            {type === 'water' && (
              <div>
                <label className="block text-[12px] font-medium text-content mb-1">Water (ml)</label>
                <input type="number" className="input" value={waterMl} onChange={(e) => setWaterMl(e.target.value)} />
              </div>
            )}
          </div>

          {message && (
            <div className={`mt-4 flex items-center justify-between gap-3 rounded-lg p-3 text-[13px] ${
              message.kind === 'success' ? 'text-gain bg-gain/10 border border-gain/20' : 'text-loss bg-warn/10 border border-warn/20'
            }`}>
              <span>{message.text}</span>
              {alreadyLogged && day === 'today' ? (
                <Link
                  to="/dashboard"
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline"
                >
                  Open dashboard
                </Link>
              ) : undoScanId && (
                <button
                  type="button"
                  onClick={() => void undoMeal()}
                  disabled={undoingMeal}
                  className="shrink-0 text-[12px] font-medium text-accent hover:underline disabled:opacity-40"
                >
                  {undoingMeal ? 'Undoing…' : 'Undo'}
                </button>
              )}
            </div>
          )}

          <Button type="submit" className="w-full mt-6" disabled={busy}>
            {busy ? 'Logging…' : 'Log Activity'}
          </Button>
        </form>
      </Card>

      {day === 'yesterday' && (
        <Card>
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold text-content">Yesterday&apos;s entries</h2>
            <p className="text-[12px] text-muted">Edit or remove an entry while it is still in the 7-day window.</p>
          </div>
          {yesterdayLogs.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">Nothing logged yesterday.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {yesterdayLogs.map((log) => {
                const meta = activityTypes.find((entry) => entry.id === log.type)
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
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-base"
                      aria-hidden="true"
                    >
                      {meta?.icon ?? ''}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{meta?.label ?? log.type}</p>
                      <p className="truncate text-[12px] text-muted">{log.activity || 'No details'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {summary && <span className="num text-[13px] text-muted">{summary}</span>}
                      <button
                        type="button"
                        onClick={() => setEditingLog(log)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-content"
                        aria-label={`Edit ${meta?.label ?? log.type} log`}
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
      )}

      {editingLog && (
        <EditLogModal
          log={editingLog}
          today={today}
          onClose={() => setEditingLog(null)}
          onSaved={() => {
            setEditingLog(null)
            setRefreshYesterday((value) => value + 1)
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
        }}
      />
    </div>
  )
}