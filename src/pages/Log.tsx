import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { detectTimezone } from '../lib/timezone'
import { Button, Card } from '../components/ui'
import { ScanFoodModal } from '../components/food/ScanFoodModal'

type ActivityType = 'workout' | 'nutrition' | 'sleep' | 'water' | 'custom'

export default function Log() {
  const [type, setType] = useState<ActivityType>('workout')
  const [activity, setActivity] = useState('')
  const [durationMin, setDurationMin] = useState<string>('')
  const [calories, setCalories] = useState<string>('')
  const [waterMl, setWaterMl] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [undoScanId, setUndoScanId] = useState<string | null>(null)
  const [undoingMeal, setUndoingMeal] = useState(false)

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
        timezone: detectTimezone(),
      })
      setMessage({ kind: 'success', text: 'Logged successfully!' })
      setActivity('')
      setDurationMin('')
      setCalories('')
      setWaterMl('')
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'already_logged_today') {
        const label = activityTypes.find((entry) => entry.id === type)?.label ?? 'That activity'
        setAlreadyLogged(true)
        setMessage({
          kind: 'error',
          text: `${label} is already logged for today. Open the dashboard to edit it, or use "Scan food" to add a meal.`,
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
            <h1 className="text-lg font-semibold">Log Today</h1>
            <p className="text-[13px] text-muted mt-1">One entry per activity type per day.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)}>
            Scan food
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-content mb-1">Calories</label>
                  <input type="number" className="input" value={calories} onChange={(e) => setCalories(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-content mb-1">Water (ml)</label>
                  <input type="number" className="input" value={waterMl} onChange={(e) => setWaterMl(e.target.value)} />
                </div>
              </div>
            )}

            {type === 'sleep' && (
              <div>
                <label className="block text-[12px] font-medium text-content mb-1">Hours</label>
                <input type="number" step="0.5" className="input" value={durationMin ? durationMin : ''} onChange={(e) => setDurationMin(e.target.value)} />
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
              {alreadyLogged ? (
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