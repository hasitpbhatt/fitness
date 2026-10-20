import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { detectTimezone, localDate } from '../lib/timezone'
import { Button, Card, Input } from '../components/ui'
import type { Measurement } from '../lib/types'

const FIELDS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', step: '0.1' },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', step: '0.1' },
  { key: 'hips_cm', label: 'Hips', unit: 'cm', step: '0.1' },
  { key: 'arms_cm', label: 'Arms', unit: 'cm', step: '0.1' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']
type FormValues = Record<FieldKey, string>

const EMPTY_FORM: FormValues = {
  weight_kg: '',
  waist_cm: '',
  hips_cm: '',
  arms_cm: '',
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function displayValue(value: number | null, unit: string) {
  return value == null ? '-' : `${value} ${unit}`
}

function fetchMeasurements() {
  return api.get<{ measurements: Measurement[] }>('/fitness/measurements?limit=365')
}

export default function Measurements() {
  const { user, loading } = useAuth()
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null)
  const [date, setDate] = useState(() => localDate(detectTimezone()))
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = async () => {
    try {
      const result = await fetchMeasurements()
      setMeasurements(result.measurements)
      setError(null)
    } catch {
      setError('Could not load your measurements.')
    }
  }

  useEffect(() => {
    if (!user) return
    let active = true
    fetchMeasurements()
      .then((result) => {
        if (!active) return
        setMeasurements(result.measurements)
        setError(null)
      })
      .catch(() => {
        if (active) setError('Could not load your measurements.')
      })
    return () => {
      active = false
    }
  }, [user])

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading measurements">
        <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Measurements</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to track your measurements.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in with Google</Link>
      </Card>
    )
  }

  const latest = measurements?.[0] ?? null
  const previousWeight = measurements?.find(
    (entry) => entry.id !== latest?.id && entry.weight_kg != null,
  )
  const weightChange =
    latest?.weight_kg != null && previousWeight?.weight_kg != null
      ? Math.round((latest.weight_kg - previousWeight.weight_kg) * 10) / 10
      : null

  const setField = (key: FieldKey, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const save = async () => {
    setError(null)
    setMessage(null)
    const payload: Record<string, unknown> = { date }
    let count = 0
    for (const field of FIELDS) {
      const raw = form[field.key].trim()
      if (!raw) continue
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        setError(`Enter a valid ${field.label.toLowerCase()}.`)
        return
      }
      payload[field.key] = value
      count += 1
    }
    if (count === 0) {
      setError('Add at least one measurement.')
      return
    }
    if (note.trim()) payload.note = note.trim()

    setBusy(true)
    try {
      await api.post('/fitness/measurements', payload)
      setMessage('Measurements saved.')
      setForm(EMPTY_FORM)
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save those measurements.')
    } finally {
      setBusy(false)
    }
  }

  const edit = (entry: Measurement) => {
    setDate(entry.recorded_at)
    setForm({
      weight_kg: entry.weight_kg == null ? '' : String(entry.weight_kg),
      waist_cm: entry.waist_cm == null ? '' : String(entry.waist_cm),
      hips_cm: entry.hips_cm == null ? '' : String(entry.hips_cm),
      arms_cm: entry.arms_cm == null ? '' : String(entry.arms_cm),
    })
    setNote(entry.note ?? '')
    setMessage(null)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = async (entry: Measurement) => {
    if (!window.confirm(`Delete measurements for ${formatDate(entry.recorded_at)}?`)) return
    setDeleting(entry.id)
    setError(null)
    try {
      await api.del(`/fitness/measurements/${entry.id}`)
      setMessage('Measurement deleted.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete that measurement.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Measurements</h1>
        <p className="mt-1 text-[13px] text-muted">
          Track weight and tape measurements over time. One entry per day.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Latest weight</p>
          <p className="num mt-1 text-2xl font-semibold">
            {latest?.weight_kg != null ? `${latest.weight_kg} kg` : '-'}
          </p>
          <p className="text-[12px] text-muted">
            {weightChange == null
              ? 'Log weight to see a trend.'
              : weightChange === 0
                ? 'No change since the previous entry.'
                : `${weightChange > 0 ? '+' : ''}${weightChange} kg since the previous entry.`}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-muted">Entries</p>
          <p className="num mt-1 text-2xl font-semibold">{measurements?.length ?? 0}</p>
          <p className="text-[12px] text-muted">Days with measurements recorded.</p>
        </Card>
      </div>

      <Card>
        <div className="px-4 py-3">
          <h2 className="font-semibold text-content">Add or update</h2>
          <p className="text-[12px] text-muted">
            Leave a field blank to keep its existing value for that day.
          </p>
        </div>
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
          <label className="text-[12px] font-medium text-content">
            Date
            <Input
              type="date"
              className="mt-1"
              value={date}
              max={localDate(detectTimezone())}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          {FIELDS.map((field) => (
            <label key={field.key} className="text-[12px] font-medium text-content">
              {field.label} ({field.unit})
              <Input
                type="number"
                inputMode="decimal"
                step={field.step}
                min="0"
                className="mt-1"
                value={form[field.key]}
                onChange={(event) => setField(field.key, event.target.value)}
              />
            </label>
          ))}
          <label className="text-[12px] font-medium text-content sm:col-span-2">
            Note
            <Input
              type="text"
              maxLength={500}
              className="mt-1"
              placeholder="Optional"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button onClick={() => void save()} loading={busy}>Save measurements</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setForm(EMPTY_FORM)
                setNote('')
                setDate(localDate(detectTimezone()))
              }}
            >
              Clear
            </Button>
            {message && <p className="text-[12px] text-gain" role="status">{message}</p>}
            {error && <p className="text-[12px] text-loss" role="alert">{error}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="px-4 py-3">
          <h2 className="font-semibold text-content">History</h2>
        </div>
        {measurements === null ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : measurements.length === 0 ? (
          <div className="px-4 pb-8 pt-2 text-center">
            <p className="text-[13px] text-muted">No measurements yet. Add the first one above.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {measurements.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-[9rem] flex-1">
                  <p className="text-[13px] font-medium">{formatDate(entry.recorded_at)}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {FIELDS.map((field) => `${field.label} ${displayValue(entry[field.key], field.unit)}`).join('  |  ')}
                  </p>
                  {entry.note && <p className="mt-1 text-[12px] text-muted">{entry.note}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => edit(entry)}
                    className="min-h-[44px] rounded-md px-3 text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-content"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(entry)}
                    disabled={deleting === entry.id}
                    className="min-h-[44px] rounded-md px-3 text-[12px] text-loss transition-colors hover:bg-loss/10 disabled:opacity-40"
                  >
                    {deleting === entry.id ? 'Deleting' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
