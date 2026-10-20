import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { detectTimezone } from '../../lib/timezone'
import { Card } from '../ui'
import type { HabitDay, HabitKey, HabitTargets, HabitsResponse } from '../../lib/types'

type QuickHabit = Exclude<HabitKey, 'sleep'>

type Row = {
  key: Exclude<keyof HabitDay, 'date'>
  targetKey: keyof HabitTargets
  label: string
  unit: string
  color: string
  quick: { habit: QuickHabit; amount: number; label: string }[]
}

const ROWS: Row[] = [
  {
    key: 'water_ml',
    targetKey: 'water_ml',
    label: 'Water',
    unit: 'ml',
    color: 'bg-accent',
    quick: [
      { habit: 'water', amount: 250, label: '+250' },
      { habit: 'water', amount: 500, label: '+500' },
    ],
  },
  {
    key: 'protein_g',
    targetKey: 'protein_g',
    label: 'Protein',
    unit: 'g',
    color: 'bg-gain',
    quick: [
      { habit: 'protein', amount: 20, label: '+20' },
      { habit: 'protein', amount: 30, label: '+30' },
    ],
  },
  {
    key: 'sleep_hours',
    targetKey: 'sleep_hours',
    label: 'Sleep',
    unit: 'h',
    color: 'bg-warn',
    quick: [],
  },
  {
    key: 'stretch_min',
    targetKey: 'stretch_min',
    label: 'Stretch',
    unit: 'min',
    color: 'bg-loss',
    quick: [{ habit: 'stretch', amount: 10, label: '+10' }],
  },
]

function formatValue(value: number, unit: string) {
  if (unit === 'h') return `${Number(value.toFixed(1))}h`
  if (unit === 'min') return `${Math.round(value)} min`
  return `${Math.round(value).toLocaleString('en-US')}${unit === 'g' ? 'g' : ' ml'}`
}

function fetchHabits() {
  const timezone = detectTimezone()
  return api.get<HabitsResponse>(`/fitness/habits?tz=${encodeURIComponent(timezone)}`)
}

export function HabitTracker({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<HabitsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await fetchHabits())
      setError(null)
    } catch {
      setError('Could not load your habits.')
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchHabits()
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch(() => {
        if (active) setError('Could not load your habits.')
      })
    return () => {
      active = false
    }
  }, [])

  const add = async (habit: QuickHabit, amount: number) => {
    const key = `${habit}:${amount}`
    setBusy(key)
    setError(null)
    try {
      await api.post('/fitness/habits/quick', { habit, amount })
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add that habit.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold text-content">Habits</h2>
          <p className="text-[12px] text-muted">Last 7 days. One tap keeps the basics moving.</p>
        </div>
        <span className="text-[11px] text-muted">7 days</span>
      </div>

      {error && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-lg border border-loss/30 bg-loss/5 px-3 py-2">
          <p className="text-[12px] text-loss">{error}</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-accent hover:underline">
            Retry
          </button>
        </div>
      )}

      {!data ? (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2" role="status" aria-label="Loading habits">
          {ROWS.map((row) => (
            <div key={row.key} className="h-24 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
          {ROWS.map((row) => {
            const target = data.targets[row.targetKey]
            const today = data.days[data.days.length - 1]?.[row.key] ?? 0
            return (
              <div key={row.key} className="rounded-lg border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-medium text-content">{row.label}</span>
                  <span className="num text-[11px] text-muted">
                    {formatValue(today, row.unit)}
                    <span className="text-muted/70"> / {formatValue(target, row.unit)}</span>
                  </span>
                </div>

                <div className="mt-2 flex h-7 gap-1" aria-label={`${row.label}, last 7 days`}>
                  {data.days.map((day) => {
                    const value = day[row.key]
                    const percent = target > 0 ? Math.min(100, (value / target) * 100) : 0
                    return (
                      <div
                        key={day.date}
                        className="flex flex-1 items-end overflow-hidden rounded-sm bg-surface-2"
                        role="img"
                        aria-label={`${row.label} ${formatValue(value, row.unit)} on ${day.date}`}
                        title={`${day.date}: ${formatValue(value, row.unit)}`}
                      >
                        {value > 0 && (
                          <div
                            className={`w-full rounded-sm ${row.color}`}
                            style={{ height: `${Math.max(8, percent)}%` }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.quick.map((quick) => (
                    <button
                      key={quick.label}
                      type="button"
                      onClick={() => void add(quick.habit, quick.amount)}
                      disabled={busy !== null}
                      className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-content transition-colors hover:bg-surface-3 disabled:opacity-40"
                    >
                      {busy === `${quick.habit}:${quick.amount}` ? 'Adding' : quick.label}
                    </button>
                  ))}
                  {row.key === 'sleep_hours' && (
                    <Link
                      to="/log"
                      className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-content transition-colors hover:bg-surface-3"
                    >
                      Log sleep
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
