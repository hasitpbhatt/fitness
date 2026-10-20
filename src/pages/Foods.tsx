import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Input } from '../components/ui'
import type { Food } from '../lib/types'

type ManualForm = {
  name: string
  calories: string
  protein_g: string
  carbs_g: string
  fat_g: string
}

const EMPTY_MANUAL: ManualForm = {
  name: '',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
}

function numberOrZero(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function fetchFoods(query: string) {
  const suffix = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return api.get<{ foods: Food[] }>(`/fitness/foods${suffix}`)
}

export default function Foods() {
  const { user, loading } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)
  const [selected, setSelected] = useState<Food | null>(null)
  const [grams, setGrams] = useState('')
  const [manual, setManual] = useState<ManualForm>(EMPTY_MANUAL)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    fetchFoods('')
      .then((result) => {
        if (active) setResults(result.foods)
      })
      .catch(() => {
        if (active) setError('Could not load foods.')
      })
    return () => {
      active = false
    }
  }, [user])

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading foods">
        <div className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-80 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Food database</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to search foods and log a meal.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in with Google</Link>
      </Card>
    )
  }

  const search = async (event: React.FormEvent) => {
    event.preventDefault()
    setSearching(true)
    setError(null)
    try {
      const result = await fetchFoods(query)
      setResults(result.foods)
    } catch {
      setError('Could not search foods.')
    } finally {
      setSearching(false)
    }
  }

  const choose = (food: Food) => {
    setSelected(food)
    setGrams(String(food.default_portion_g))
    setMessage(null)
    setError(null)
  }

  const gramsNumber = Number(grams)
  const factor = Number.isFinite(gramsNumber) && gramsNumber > 0 ? gramsNumber / 100 : 0
  const portion = selected
    ? {
        calories: Math.round(selected.per_100g_calories * factor),
        protein: Math.round(selected.per_100g_protein_g * factor * 10) / 10,
        carbs: Math.round(selected.per_100g_carbs_g * factor * 10) / 10,
        fat: Math.round(selected.per_100g_fat_g * factor * 10) / 10,
      }
    : null

  const logFood = async () => {
    if (!selected) return
    if (!Number.isFinite(gramsNumber) || gramsNumber <= 0 || gramsNumber > 5_000) {
      setError('Enter a portion between 1 and 5,000 g.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.post<{ item: { calories: number } }>('/fitness/foods/log', {
        food_id: selected.id,
        grams: gramsNumber,
      })
      setMessage(`Added about ${result.item.calories} kcal to today.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log that food.')
    } finally {
      setBusy(false)
    }
  }

  const logManual = async () => {
    if (!manual.name.trim()) {
      setError('Give the food a name.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api.post<{ item: { calories: number } }>('/fitness/foods/log', {
        manual: {
          name: manual.name.trim(),
          calories: numberOrZero(manual.calories),
          protein_g: numberOrZero(manual.protein_g),
          carbs_g: numberOrZero(manual.carbs_g),
          fat_g: numberOrZero(manual.fat_g),
        },
      })
      setMessage(`Added ${result.item.calories} kcal to today.`)
      setManual(EMPTY_MANUAL)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log that food.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Food database</h1>
        <p className="mt-1 text-[13px] text-muted">
          Search common Indian foods and brands, then scale the portion before logging.
        </p>
      </div>

      {(message || error) && (
        <div className={`rounded-lg border px-3 py-2 text-[12px] ${error ? 'border-loss/30 bg-loss/5 text-loss' : 'border-gain/30 bg-gain/5 text-gain'}`} role="status">
          {error ?? message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <form onSubmit={(event) => void search(event)} className="flex gap-2 border-b border-line px-4 py-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search roti, dal, paneer, Amul..."
              aria-label="Search foods"
            />
            <Button type="submit" loading={searching}>Search</Button>
          </form>
          <div className="max-h-[28rem] overflow-y-auto">
            {results === null ? (
              <div className="flex flex-col gap-2 p-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-2" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <p className="p-8 text-center text-[13px] text-muted">
                No matches. Add it manually on the right.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {results.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => choose(food)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${
                      selected?.id === food.id ? 'bg-surface-2' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{food.name}</p>
                      <p className="truncate text-[12px] text-muted">
                        {[food.brand, food.category].filter(Boolean).join(' · ') || 'Food'}
                      </p>
                    </div>
                    <div className="num shrink-0 text-right text-[12px] text-muted">
                      <p>{Math.round(food.per_100g_calories)} kcal</p>
                      <p className="text-[11px]">per 100 g</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-content">Portion</h2>
              <p className="text-[12px] text-muted">
                {selected ? selected.name : 'Choose a food from the list.'}
              </p>
            </div>
            {selected && portion ? (
              <div className="flex flex-col gap-3 px-4 pb-4">
                <label className="text-[12px] font-medium text-content">
                  Amount (g)
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    max="5000"
                    className="mt-1"
                    value={grams}
                    onChange={(event) => setGrams(event.target.value)}
                  />
                </label>
                {selected.portion_label && (
                  <p className="text-[12px] text-muted">
                    Default: {selected.portion_label} ({selected.default_portion_g} g)
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <p className="rounded-lg bg-surface-2 px-2 py-1.5">Calories <span className="num font-medium">{portion.calories}</span></p>
                  <p className="rounded-lg bg-surface-2 px-2 py-1.5">Protein <span className="num font-medium">{portion.protein} g</span></p>
                  <p className="rounded-lg bg-surface-2 px-2 py-1.5">Carbs <span className="num font-medium">{portion.carbs} g</span></p>
                  <p className="rounded-lg bg-surface-2 px-2 py-1.5">Fat <span className="num font-medium">{portion.fat} g</span></p>
                </div>
                <Button onClick={() => void logFood()} loading={busy}>Add to today</Button>
                <Link to="/dashboard" className="text-center text-[12px] text-muted hover:text-content">
                  View today&apos;s dashboard
                </Link>
              </div>
            ) : (
              <div className="px-4 pb-6 text-[13px] text-muted">
                Search or pick a food to see its scaled nutrition.
              </div>
            )}
          </Card>

          <Card>
            <div className="px-4 py-3">
              <h2 className="font-semibold text-content">Manual entry</h2>
              <p className="text-[12px] text-muted">Not in the list? Enter the nutrition yourself.</p>
            </div>
            <div className="flex flex-col gap-3 px-4 pb-4">
              <Input
                placeholder="Food name"
                value={manual.name}
                onChange={(event) => setManual((previous) => ({ ...previous, name: event.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Calories"
                  value={manual.calories}
                  onChange={(event) => setManual((previous) => ({ ...previous, calories: event.target.value }))}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Protein (g)"
                  value={manual.protein_g}
                  onChange={(event) => setManual((previous) => ({ ...previous, protein_g: event.target.value }))}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Carbs (g)"
                  value={manual.carbs_g}
                  onChange={(event) => setManual((previous) => ({ ...previous, carbs_g: event.target.value }))}
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Fat (g)"
                  value={manual.fat_g}
                  onChange={(event) => setManual((previous) => ({ ...previous, fat_g: event.target.value }))}
                />
              </div>
              <Button variant="secondary" onClick={() => void logManual()} loading={busy}>
                Add manual food
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
