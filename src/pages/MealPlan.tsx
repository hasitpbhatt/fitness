import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { Alert } from '../components/feedback'
import { Icon } from '../components/icons'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

type Diet = 'vegetarian' | 'eggetarian' | 'vegan' | 'non-vegetarian'

const DIETS: Array<{ value: Diet; label: string; short: string }> = [
  { value: 'vegetarian', label: 'Vegetarian', short: 'Veg' },
  { value: 'eggetarian', label: 'Eggetarian', short: 'Egg' },
  { value: 'vegan', label: 'Vegan', short: 'Vegan' },
  { value: 'non-vegetarian', label: 'Non-vegetarian', short: 'Non-veg' },
]

type PlanItem = {
  name: string
  grams: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  booster: boolean
}

type Totals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

type PlanMeal = {
  slot: string
  items: PlanItem[]
  totals: Totals
}

type PlanDay = {
  date: string
  label: string
  date_label: string
  is_today: boolean
  meals: PlanMeal[]
  totals: Totals
  protein_gap_g: number
  booster_g: number
}

type MealPlan = {
  diet: Diet
  diet_label: string
  date: string
  timezone: string
  target_calories: number
  target_protein_g: number
  uses_defaults: boolean
  average_totals: Pick<Totals, 'calories' | 'protein_g'>
  days: PlanDay[]
  notes: string[]
  adjustments: string[]
}

function MealCard({ day }: { day: PlanDay }) {
  return (
    <Card className="print-avoid-break overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-[15px] font-semibold">{day.label}</h2>
          <span className="text-[11px] text-muted">{day.date_label}</span>
        </div>
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="num font-semibold">{day.totals.calories} kcal</span>
          <span className={`num ${day.protein_gap_g > 10 ? 'text-warn' : 'text-gain'}`}>
            {day.totals.protein_g} g protein
          </span>
        </div>
      </div>

      <div className="divide-y divide-line">
        {day.meals.map((meal) => (
          <section key={meal.slot} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted">{meal.slot}</h3>
              <span className="num text-[11px] text-muted">
                {meal.totals.calories} kcal · {meal.totals.protein_g} g P
              </span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {meal.items.map((item) => (
                <li
                  key={`${meal.slot}-${item.name}-${item.grams}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                >
                  <span className="text-[13px] text-content">
                    {item.name}
                    {item.booster && (
                      <span className="ml-1.5 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        protein top-up
                      </span>
                    )}
                  </span>
                  <span className="num text-[11px] text-muted">
                    {item.grams} g · {item.calories} kcal · {item.protein_g} g P
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}

export default function MealPlan() {
  const { user, loading } = useAuth()
  const [diet, setDiet] = useState<Diet>('vegetarian')
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [activeDay, setActiveDay] = useState(0)

  useEffect(() => {
    if (!user) return
    let active = true
    api.get<MealPlan>(`/fitness/meal-plan?diet=${diet}`)
      .then((result) => {
        if (!active) return
        setPlan(result)
        setError(null)
        setActiveDay(0)
      })
      .catch(() => {
        if (!active) return
        setPlan(null)
        setError('Could not build your meal plan. Please try again.')
      })
      .finally(() => {
        if (active) setFetching(false)
      })
    return () => {
      active = false
    }
  }, [user, diet, retryKey])

  const chooseDiet = (next: Diet) => {
    if (next === diet) return
    setDiet(next)
    setFetching(true)
    setError(null)
  }

  const retry = () => {
    setRetryKey((key) => key + 1)
    setFetching(true)
    setError(null)
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4" role="status" aria-label="Loading meal plan">
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Meal plan</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to see a 7-day plan scaled to your targets.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in with Google</Link>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" aria-busy={fetching}>
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">fitness — 7-day meal plan</h1>
        {plan && (
          <p className="mt-1 text-[12px] text-muted">
            {plan.diet_label} · target {plan.target_calories} kcal · {plan.target_protein_g} g protein
          </p>
        )}
      </div>

      <div className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-content">Meal plan</h1>
            <p className="mt-1 text-[13px] text-muted">
              A simple 7-day Indian plan, scaled toward your calorie and protein targets.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!plan || fetching}>
            <Icon name="printer" size={16} />
            Print / save PDF
          </Button>
        </div>

        {/* Diet selector. Four options, and the one that matches what the
            member told their coach is the one that is actually served. */}
        <div className="flex flex-col gap-2">
          <div
            className="scroll-x scroll-x-pad"
            role="group"
            aria-label="Diet"
          >
            {DIETS.map((option) => {
              const active = plan ? plan.diet === option.value : diet === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseDiet(option.value)}
                  className={`min-h-[40px] rounded-lg border px-3 text-[12px] font-medium transition-colors ${
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-muted hover:bg-surface-2 hover:text-content'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted">
            Not right?{' '}
            <Link to="/coach" className="text-accent hover:underline">
              Tell your coach what you like or avoid
            </Link>{' '}
            and the plan follows.
          </p>
        </div>
      </div>

      {error && (
        <div className="no-print">
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={retry}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        </div>
      )}

      {!plan && fetching && (
        <div className="flex flex-col gap-4" role="status" aria-label="Building meal plan">
          <div className="h-28 animate-pulse rounded-xl border border-line bg-surface" />
          <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
        </div>
      )}

      {plan && (
        <>
          <Card className={`print-avoid-break p-4 ${fetching ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Daily target</p>
                <p className="num mt-0.5 text-xl font-semibold">{plan.target_calories} kcal</p>
                <p className="text-[12px] text-muted">{plan.target_protein_g} g protein</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Plan average</p>
                <p className="num mt-0.5 text-xl font-semibold">{plan.average_totals.calories} kcal</p>
                <p className="text-[12px] text-muted">{plan.average_totals.protein_g} g protein</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Plan</p>
                <p className="mt-0.5 text-[14px] font-medium text-content">{plan.diet_label}</p>
                <p className="text-[12px] text-muted">7 days from {plan.days[0]?.date_label}</p>
              </div>
            </div>

            {plan.adjustments.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">Adapted to you</p>
                <ul className="mt-1.5 space-y-1">
                  {plan.adjustments.map((adjustment) => (
                    <li key={adjustment} className="flex gap-2 text-[12px] text-muted">
                      <span className="text-accent" aria-hidden="true">
                        •
                      </span>
                      <span>{adjustment}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.uses_defaults && (
              <p className="mt-3 border-t border-line pt-3 text-[12px] text-warn">
                Some targets are still at the default. Set your calorie and protein targets on the{' '}
                <Link to="/dashboard" className="underline">dashboard</Link> to personalize portions.
              </p>
            )}
          </Card>

          {/* Seven stacked day cards is a 4000px page on a phone. On a small
              screen the days become a tab strip; on a wide screen (and in
              print) every day stays on the page. */}
          <div className="lg:hidden">
            <div className="scroll-x scroll-x-pad mb-3" role="tablist" aria-label="Plan day">
              {plan.days.map((day, index) => (
                <button
                  key={day.date}
                  type="button"
                  role="tab"
                  aria-selected={index === activeDay}
                  onClick={() => setActiveDay(index)}
                  className={`min-h-[40px] rounded-lg border px-3 text-[12px] font-medium transition-colors ${
                    index === activeDay
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-muted hover:text-content'
                  }`}
                >
                  {day.date_label}
                </button>
              ))}
            </div>
            <div className={fetching ? 'opacity-60' : ''}>
              {plan.days[activeDay] && <MealCard day={plan.days[activeDay]} />}
            </div>
          </div>

          <div className={`hidden flex-col gap-4 lg:flex ${fetching ? 'opacity-60' : ''}`}>
            {plan.days.map((day) => (
              <MealCard key={day.date} day={day} />
            ))}
          </div>

          <Card className="print-avoid-break p-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Notes</h2>
            <ul className="mt-2 space-y-1 text-[12px] text-muted">
              {plan.notes.map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="text-accent" aria-hidden="true">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
