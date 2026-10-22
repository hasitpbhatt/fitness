import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button, Card, Input } from '../components/ui'
import { Alert } from '../components/feedback'
import { Icon } from '../components/icons'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { detectTimezone, formatTimezoneLabel, timezoneOptions } from '../lib/timezone'
import { LOCALES, useLocale, type Locale } from '../i18n'

type Goal = 'lose' | 'maintain' | 'gain'
type Sex = 'female' | 'male'
type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'

type BodyProfile = {
  goal_type: Goal
  sex: Sex
  birth_year: number
  height_cm: number
  weight_kg: number
  activity_level: Activity
}

type Step = 'language' | 'goal' | 'about' | 'activity' | 'timezone'

const GOALS: Goal[] = ['lose', 'maintain', 'gain']
const ACTIVITIES: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'athlete']

// Sensible defaults so the member can move straight through with two taps.
const CURRENT_YEAR = new Date().getFullYear()

const DEFAULTS: BodyProfile = {
  goal_type: 'maintain',
  sex: 'female',
  birth_year: CURRENT_YEAR - 35,
  height_cm: 155,
  weight_kg: 60,
  activity_level: 'light',
}

/** A big, friendly stepper - no typing, no tiny keyboard. */
function Stepper({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (next: number) => void
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-[13px] font-medium text-content">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          className="tap flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-[20px] font-semibold text-content hover:bg-surface-3 disabled:opacity-40"
          aria-label={`${label} -`}
        >
          −
        </button>
        <p className="num text-center text-[18px] font-semibold text-content">
          {value}
          <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span>
        </p>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          className="tap flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-[20px] font-semibold text-content hover:bg-surface-3 disabled:opacity-40"
          aria-label={`${label} +`}
        >
          +
        </button>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const { user, loading, logout } = useAuth()
  const { t, setLocale } = useLocale()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('language')
  const [profile, setProfile] = useState<BodyProfile>(DEFAULTS)
  const [timezone, setTimezone] = useState(() => detectTimezone())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false)
  const [languageChosen, setLanguageChosen] = useState(false)

  const [zoneOptions] = useState(() =>
    timezoneOptions().map((zone) => ({ value: zone, label: formatTimezoneLabel(zone) })),
  )

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .get<{ timezone: string | null; onboarded: boolean }>(
        `/fitness/profile?tz=${encodeURIComponent(detectTimezone())}`,
      )
      .then((data) => {
        if (cancelled) return
        if (data.timezone) setTimezone(data.timezone)
        setAlreadyOnboarded(data.onboarded)
      })
      .catch(() => {
        // Keep the detected timezone and show the wizard anyway.
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const steps: Step[] = useMemo(
    () => (languageChosen ? ['goal', 'about', 'activity', 'timezone'] : ['language', 'goal', 'about', 'activity', 'timezone']),
    [languageChosen],
  )
  const stepIndex = Math.max(0, steps.indexOf(step))

  const pickLanguage = (next: Locale) => {
    setLocale(next)
    setLanguageChosen(true)
    setStep('goal')
  }

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post('/fitness/onboarding/profile', {
        ...profile,
        timezone,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('onboarding.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading || (user && checking)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <p className="text-[13px] text-muted" role="status">
          {t('onboarding.saving')}
        </p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (alreadyOnboarded) return <Navigate to="/dashboard" replace />

  const heading: Record<Step, string> = {
    language: t('onboarding.languageTitle'),
    goal: t('onboarding.goalTitle'),
    about: t('onboarding.aboutTitle'),
    activity: t('onboarding.activityTitle'),
    timezone: t('onboarding.timezoneTitle'),
  }
  const subheading: Record<Step, string> = {
    language: t('onboarding.languageSubtitle'),
    goal: t('onboarding.goalSubtitle'),
    about: t('onboarding.aboutSubtitle'),
    activity: t('onboarding.activitySubtitle'),
    timezone: t('onboarding.timezoneSubtitle'),
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[56px] max-w-2xl items-center justify-between px-4">
          <p className="text-[13px] text-muted">
            {t('onboarding.step', { current: stepIndex + 1, total: steps.length })}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="tap rounded-lg px-2 text-[13px] text-muted hover:text-content"
          >
            {t('nav.signOut')}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <h1 className="text-xl font-semibold text-content">{heading[step]}</h1>
        <p className="mt-1 text-[13px] text-muted">{subheading[step]}</p>

        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="mt-5 flex-1">
          {step === 'language' && (
            <div className="grid gap-2.5">
              {LOCALES.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => pickLanguage(option.code)}
                  className="tap flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent/50"
                >
                  <span className="text-[16px] font-medium text-content">{option.native}</span>
                  <span className="text-[13px] text-muted">{option.label}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setLanguageChosen(true)
                  setStep('goal')
                }}
                className="tap mt-1 rounded-xl px-4 py-3 text-[13px] text-muted hover:text-content"
              >
                {t('onboarding.skip')}
              </button>
            </div>
          )}

          {step === 'goal' && (
            <div className="grid gap-2.5">
              {GOALS.map((goal) => (
                <button
                  key={goal}
                  type="button"
                  onClick={() => setProfile({ ...profile, goal_type: goal })}
                  aria-pressed={profile.goal_type === goal}
                  className={`tap flex flex-col items-start rounded-xl border px-4 py-3.5 text-left transition-colors ${
                    profile.goal_type === goal
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-surface hover:border-accent/40'
                  }`}
                >
                  <span className="text-[16px] font-medium text-content">
                    {t(`onboarding.goal.${goal}` as 'onboarding.goal.lose')}
                  </span>
                  <span className="mt-0.5 text-[12px] text-muted">
                    {t(`onboarding.goal.${goal}Hint` as 'onboarding.goal.loseHint')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'about' && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2.5">
                {(['female', 'male'] as Sex[]).map((sex) => (
                  <button
                    key={sex}
                    type="button"
                    onClick={() => setProfile({ ...profile, sex })}
                    aria-pressed={profile.sex === sex}
                    className={`tap rounded-xl border px-4 py-3.5 text-center text-[15px] font-medium transition-colors ${
                      profile.sex === sex
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-line bg-surface text-content hover:border-accent/40'
                    }`}
                  >
                    {t(`onboarding.sex.${sex}` as 'onboarding.sex.female')}
                  </button>
                ))}
              </div>

              <Stepper
                label={t('onboarding.age')}
                value={CURRENT_YEAR - profile.birth_year}
                unit={t('onboarding.ageUnit')}
                min={13}
                max={100}
                step={1}
                onChange={(age) =>
                  setProfile({ ...profile, birth_year: CURRENT_YEAR - age })
                }
              />
              <Stepper
                label={t('onboarding.height')}
                value={profile.height_cm}
                unit={t('onboarding.heightUnit')}
                min={120}
                max={230}
                step={1}
                onChange={(height) => setProfile({ ...profile, height_cm: height })}
              />
              <Stepper
                label={t('onboarding.weight')}
                value={profile.weight_kg}
                unit={t('onboarding.weightUnit')}
                min={30}
                max={250}
                step={1}
                onChange={(weight) => setProfile({ ...profile, weight_kg: weight })}
              />
            </div>
          )}

          {step === 'activity' && (
            <div className="grid gap-2.5">
              {ACTIVITIES.map((activity) => (
                <button
                  key={activity}
                  type="button"
                  onClick={() => setProfile({ ...profile, activity_level: activity })}
                  aria-pressed={profile.activity_level === activity}
                  className={`tap flex flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors ${
                    profile.activity_level === activity
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-surface hover:border-accent/40'
                  }`}
                >
                  <span className="text-[15px] font-medium text-content">
                    {t(`onboarding.activity.${activity}` as 'onboarding.activity.light')}
                  </span>
                  <span className="mt-0.5 text-[12px] text-muted">
                    {t(`onboarding.activity.${activity}Hint` as 'onboarding.activity.lightHint')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'timezone' && (
            <div className="grid gap-3">
              <Card className="p-4">
                <p className="num text-[16px] font-semibold text-content">{formatTimezoneLabel(timezone)}</p>
                <p className="mt-1 text-[12px] text-muted">{timezone}</p>
                <details className="mt-3">
                  <summary className="tap cursor-pointer list-none text-[13px] text-accent">
                    {t('onboarding.timezoneChange')}
                  </summary>
                  <div className="mt-2">
                    <Input
                      list="timezone-options"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      aria-label={t('onboarding.timezoneTitle')}
                    />
                    <datalist id="timezone-options">
                      {zoneOptions.map((zone) => (
                        <option key={zone.value} value={zone.value} />
                      ))}
                    </datalist>
                  </div>
                </details>
              </Card>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2">
          {stepIndex > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                const previous = steps[stepIndex - 1]
                setStep(previous)
              }}
              disabled={saving}
            >
              {t('onboarding.back')}
            </Button>
          )}
          <div className="flex-1" />
          {step === 'about' && (
            <Button
              variant="ghost"
              onClick={() => {
                setProfile(DEFAULTS)
                setStep('timezone')
              }}
              disabled={saving}
            >
              {t('onboarding.quickSetup')}
            </Button>
          )}
          {step === 'timezone' ? (
            <Button onClick={() => void submit()} loading={saving} className="px-6">
              {t('onboarding.finish')}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(steps[stepIndex + 1] ?? 'timezone')}
              disabled={saving}
              className="px-6"
            >
              {t('onboarding.next')}
              <Icon name="chevron-right" size={16} />
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
