import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { addDays } from '../lib/timezone'
import { useModalFocus } from '../lib/useModalFocus'
import { Button, Input, Textarea } from './ui'
import type { FitnessLog } from '../lib/types'

type Props = {
  log: FitnessLog
  today: string
  onClose: () => void
  onSaved: () => void
}

function toInput(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

export function EditLogModal({ log, today, onClose, onSaved }: Props) {
  const [activity, setActivity] = useState(log.activity ?? '')
  const [duration, setDuration] = useState(toInput(log.duration_min))
  const [calories, setCalories] = useState(toInput(log.calories))
  const [water, setWater] = useState(toInput(log.water_ml))
  const [protein, setProtein] = useState(toInput(log.protein_g))
  const [carbs, setCarbs] = useState(toInput(log.carbs_g))
  const [fat, setFat] = useState(toInput(log.fat_g))
  const [hours, setHours] = useState(toInput(log.hours ?? (log.type === 'sleep' ? log.duration_min : null)))
  const [note, setNote] = useState(log.note ?? '')
  const [date, setDate] = useState(log.recorded_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(true, dialogRef, onClose, busy)

  function numberOrNull(raw: string): number | null {
    if (!raw.trim()) return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) throw new Error('Numbers must be zero or more.')
    return value
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        activity: activity.trim() || null,
        note: note.trim() || null,
        recorded_at: date,
      }
      if (log.type === 'workout') {
        payload.duration_min = numberOrNull(duration)
        payload.calories = numberOrNull(calories)
      } else if (log.type === 'nutrition') {
        payload.calories = numberOrNull(calories)
        payload.protein_g = numberOrNull(protein)
        payload.carbs_g = numberOrNull(carbs)
        payload.fat_g = numberOrNull(fat)
      } else if (log.type === 'water') {
        payload.water_ml = numberOrNull(water)
      } else if (log.type === 'sleep') {
        payload.hours = numberOrNull(hours)
        payload.duration_min = null
      }
      await api.patch(`/fitness/log/${log.id}`, payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that log.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Delete this log? Your streak and check-in stay as they are.')) return
    setBusy(true)
    setError(null)
    try {
      await api.del(`/fitness/log/${log.id}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that log.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-log-title"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="edit-log-title" className="text-lg font-semibold">
          Edit {log.type} log
        </h2>
        <p className="mt-1 text-[12px] text-muted">
          Fix a mistake or move this entry within the last 7 days.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="edit-activity" className="block text-[12px] font-medium">
              Activity
            </label>
            <Input
              id="edit-activity"
              className="mt-1"
              value={activity}
              onChange={(event) => setActivity(event.target.value)}
            />
          </div>

          {log.type === 'workout' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-duration" className="block text-[12px] font-medium">
                  Duration (min)
                </label>
                <Input
                  id="edit-duration"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="edit-calories" className="block text-[12px] font-medium">
                  Calories
                </label>
                <Input
                  id="edit-calories"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={calories}
                  onChange={(event) => setCalories(event.target.value)}
                />
              </div>
            </div>
          )}

          {log.type === 'nutrition' && (
            <>
              <div>
                <label htmlFor="edit-nutrition-calories" className="block text-[12px] font-medium">
                  Calories
                </label>
                <Input
                  id="edit-nutrition-calories"
                  type="number"
                  min={0}
                  className="mt-1"
                  value={calories}
                  onChange={(event) => setCalories(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="edit-protein" className="block text-[12px] font-medium">
                    Protein (g)
                  </label>
                  <Input
                    id="edit-protein"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={protein}
                    onChange={(event) => setProtein(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-carbs" className="block text-[12px] font-medium">
                    Carbs (g)
                  </label>
                  <Input
                    id="edit-carbs"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={carbs}
                    onChange={(event) => setCarbs(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-fat" className="block text-[12px] font-medium">
                    Fat (g)
                  </label>
                  <Input
                    id="edit-fat"
                    type="number"
                    min={0}
                    className="mt-1"
                    value={fat}
                    onChange={(event) => setFat(event.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {log.type === 'water' && (
            <div>
              <label htmlFor="edit-water" className="block text-[12px] font-medium">
                Water (ml)
              </label>
              <Input
                id="edit-water"
                type="number"
                min={0}
                className="mt-1"
                value={water}
                onChange={(event) => setWater(event.target.value)}
              />
            </div>
          )}

          {log.type === 'sleep' && (
            <div>
              <label htmlFor="edit-hours" className="block text-[12px] font-medium">
                Hours
              </label>
              <Input
                id="edit-hours"
                type="number"
                min={0}
                step="0.5"
                className="mt-1"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
          )}

          <div>
            <label htmlFor="edit-date" className="block text-[12px] font-medium">
              Date
            </label>
            <Input
              id="edit-date"
              type="date"
              className="mt-1"
              min={addDays(today, -7)}
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="edit-note" className="block text-[12px] font-medium">
              Note
            </label>
            <Textarea
              id="edit-note"
              className="mt-1"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-loss">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={() => void remove()} disabled={busy} className="text-loss">
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={busy}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
