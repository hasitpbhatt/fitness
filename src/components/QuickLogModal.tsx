import { useState } from 'react'
import { api } from '../lib/api'

export function QuickLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'workout' | 'nutrition' | 'sleep' | 'water'>('workout')
  const [activity, setActivity] = useState('')
  const [duration, setDuration] = useState('')
  const [calories, setCalories] = useState('')
  const [water, setWater] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/fitness/log', {
        type,
        activity: activity.trim(),
        duration_min: duration ? parseInt(duration) : null,
        calories: calories ? parseInt(calories) : null,
        water_ml: water ? parseInt(water) : null,
      })
      setActivity('')
      setDuration('')
      setCalories('')
      setWater('')
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to log.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface rounded-t-2xl md:rounded-xl border border-line p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-content">Quick Log</h2>
          <button onClick={onClose} className="text-muted hover:text-content">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['workout', 'nutrition', 'sleep', 'water'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                type === t ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-content'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Activity description"
            className="input w-full"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          />
          {type === 'workout' && (
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Duration (min)" className="input" value={duration} onChange={(e) => setDuration(e.target.value)} />
              <input type="number" placeholder="Calories" className="input" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
          )}
          {type === 'water' && (
            <input type="number" placeholder="Water (ml)" className="input w-full" value={water} onChange={(e) => setWater(e.target.value)} />
          )}
          {type === 'nutrition' && (
            <input type="number" placeholder="Calories" className="input w-full" value={calories} onChange={(e) => setCalories(e.target.value)} />
          )}
          {type === 'sleep' && (
            <input type="number" step="0.5" placeholder="Hours" className="input w-full" value={duration} onChange={(e) => setDuration(e.target.value)} />
          )}
          {error && <p className="text-loss text-[12px]">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
            {busy ? 'Logging…' : 'Log Activity'}
          </button>
        </form>
      </div>
    </div>
  )
}