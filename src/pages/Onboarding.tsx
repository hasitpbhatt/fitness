import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Input, Select } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { FitnessProfile } from '../lib/types'
import { detectTimezone, formatTimezoneLabel, timezoneOptions } from '../lib/timezone'

type GoalType = 'workout' | 'nutrition' | 'water' | 'sleep'

const GOALS: {
  type: GoalType
  label: string
  description: string
  target: number
  min: number
  max: number
  step: number
  unit: string
  targetLabel: string
}[] = [
  {
    type: 'workout',
    label: 'Move more',
    description: 'Build a weekly training habit.',
    target: 150,
    min: 1,
    max: 10_000,
    step: 5,
    unit: 'min / week',
    targetLabel: 'Workout minutes per week',
  },
  {
    type: 'nutrition',
    label: 'Eat well',
    description: 'Keep daily calories in a steady range.',
    target: 2_000,
    min: 100,
    max: 20_000,
    step: 50,
    unit: 'kcal / day',
    targetLabel: 'Calories per day',
  },
  {
    type: 'water',
    label: 'Hydrate',
    description: 'Make water the easy default.',
    target: 2_500,
    min: 100,
    max: 20_000,
    step: 100,
    unit: 'ml / day',
    targetLabel: 'Water per day (ml)',
  },
  {
    type: 'sleep',
    label: 'Sleep well',
    description: 'Protect a consistent night.',
    target: 8,
    min: 1,
    max: 24,
    step: 1,
    unit: 'h / night',
    targetLabel: 'Sleep per night (hours)',
  },
]

export default function Onboarding() {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false)
  const [goalType, setGoalType] = useState<GoalType>('workout')
  const [target, setTarget] = useState('150')
  const [timezone, setTimezone] = useState(() => detectTimezone())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoneOptions] = useState(() =>
    timezoneOptions().map((zone) => ({ value: zone, label: formatTimezoneLabel(zone) })),
  )

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .get<FitnessProfile>(`/fitness/profile?tz=${encodeURIComponent(detectTimezone())}`)
      .then((profile) => {
        if (cancelled) return
        if (profile.timezone) setTimezone(profile.timezone)
        setAlreadyOnboarded(profile.onboarded)
      })
      .catch(() => {
        // Keep the detected timezone and show the form if the check fails.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const selected = GOALS.find((goal) => goal.type === goalType) ?? GOALS[0]

  function chooseGoal(next: (typeof GOALS)[number]) {
    setGoalType(next.type)
    setTarget(String(next.target))
    setError(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(target)
    if (!Number.isFinite(parsed) || parsed < selected.min || parsed > selected.max) {
      setError(`Enter a target between ${selected.min} and ${selected.max} ${selected.unit}.`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post('/fitness/onboarding', {
        goal_type: goalType,
        goal_target: parsed,
        timezone,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your setup. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading || (user && checking)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <p className="text-[13px] text-muted" role="status">
          Setting things up…
        </p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (alreadyOnboarded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold">You&apos;re all set</h1>
          <p className="mt-2 text-[13px] text-muted">Your focus and timezone are already saved.</p>
          <Link to="/dashboard" className="btn-primary mt-5 inline-flex">
            Go to dashboard
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 font-semibold">
            <span className="text-accent" aria-hidden="true">▲</span> fitness
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-[44px] text-[12px] text-muted hover:text-content"
          >
            Use a different account
          </button>
        </div>

        <div className="mt-6">
          <p className="text-[11px] uppercase tracking-wide text-muted">Welcome, {user.username}</p>
          <h1 className="mt-1 text-2xl font-semibold">What should we help you with first?</h1>
          <p className="mt-2 text-[13px] text-muted">
            Pick one focus for now. You can change your targets from the dashboard later.
          </p>
        </div>

        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {GOALS.map((goal) => {
              const active = goal.type === goalType
              return (
                <button
                  key={goal.type}
                  type="button"
                  onClick={() => chooseGoal(goal)}
                  aria-pressed={active}
                  className={`min-h-[92px] rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-accent bg-accent/5'
                      : 'border-line bg-surface hover:border-accent/40'
                  }`}
                >
                  <span className="block text-[14px] font-semibold">{goal.label}</span>
                  <span className="mt-1 block text-[12px] text-muted">{goal.description}</span>
                  <span className="mt-2 block text-[11px] uppercase tracking-wide text-accent">
                    {goal.unit}
                  </span>
                </button>
              )
            })}
          </div>

          <Card className="p-4">
            <label htmlFor="goal-target" className="block text-[12px] font-medium text-muted">
              {selected.targetLabel}
            </label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                min={selected.min}
                max={selected.max}
                step={selected.step}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
              <span className="shrink-0 text-[12px] text-muted">{selected.unit}</span>
            </div>
          </Card>

          <Card className="p-4">
            <label htmlFor="onboarding-timezone" className="block text-[12px] font-medium text-muted">
              Your timezone
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Logs, streaks, and goals roll over at midnight here.
            </p>
            <Select
              id="onboarding-timezone"
              className="mt-2"
              value={timezone}
              onChange={setTimezone}
              placeholder=""
              options={zoneOptions}
            />
          </Card>

          {error && (
            <p className="text-[12px] text-loss" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={saving}>
            Start my plan
          </Button>
        </form>
      </div>
    </div>
  )
}
