import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import {
  AI_EXHAUSTED_MESSAGE,
  AI_OUT_OF_CREDITS_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  aiQuotaSummary,
} from '../../lib/aiUsage'
import { detectTimezone } from '../../lib/timezone'
import { useModalFocus } from '../../lib/useModalFocus'
import type { ScanItem, ScanQuota, ScanResult, ScanTotals } from '../../lib/types'
import { AIUsageMeter } from '../ai/AIUsageMeter'
import { Button, Input } from '../ui'

type Props = {
  open: boolean
  onClose: () => void
  onLogged: (meal: { calories: number; scanId: string }) => void
}

type Phase = 'capture' | 'scanning' | 'review' | 'saving' | 'error'

const MAX_SOURCE_BYTES = 5 * 1024 * 1024

const EMPTY_TOTALS: ScanTotals = {
  calories: 0,
  calories_low: 0,
  calories_high: 0,
  protein_g: 0,
  fat_g: 0,
  carbs_g: 0,
}

function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return AI_EXHAUSTED_MESSAGE
    if (err.code === 'out_of_credits') return AI_OUT_OF_CREDITS_MESSAGE
    if (err.status === 503) return AI_UNAVAILABLE_MESSAGE
    if (err.code === 'invalid_model_output') {
      return "The AI couldn't read that estimate. Try another photo or add a little more detail."
    }
    if (err.status === 502 || err.status === 504) {
      return 'The estimate did not finish. Try again, or log this meal manually.'
    }
    if (err.message) return err.message
  }
  return fallback
}

function withCalorieRange(calories: number): Pick<ScanItem, 'calories' | 'calories_low' | 'calories_high'> {
  return {
    calories,
    calories_low: Math.round(calories * 0.8),
    calories_high: Math.round(calories * 1.2),
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxDimension = 1024
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not read that image.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function ScanFoodModal({ open, onClose, onLogged }: Props) {
  const [phase, setPhase] = useState<Phase>('capture')
  const [preview, setPreview] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [items, setItems] = useState<ScanItem[]>([])
  const [description, setDescription] = useState('')
  const [textInput, setTextInput] = useState('')
  const [quota, setQuota] = useState<ScanQuota | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const reset = useCallback(() => {
    setPhase('capture')
    setPreview(null)
    setScan(null)
    setItems([])
    setDescription('')
    setTextInput('')
    setQuota(null)
    setConfigured(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .get<{ quota: ScanQuota; configured: boolean }>('/fitness/scan/quota')
      .then((result) => {
        if (cancelled) return
        setQuota(result.quota)
        setConfigured(result.configured)
      })
      .catch(() => {
        // Quota is advisory here; the estimate request is still authoritative.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const busy = phase === 'scanning' || phase === 'saving'
  const atLimit = quota !== null && quota.used >= quota.limit
  const aiUnavailable = configured === false
  useModalFocus(open, dialogRef, onClose, busy)

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          calories: acc.calories + (Number(item.calories) || 0),
          calories_low: acc.calories_low + (Number(item.calories_low) || 0),
          calories_high: acc.calories_high + (Number(item.calories_high) || 0),
          protein_g: acc.protein_g + (Number(item.protein_g) || 0),
          fat_g: acc.fat_g + (Number(item.fat_g) || 0),
          carbs_g: acc.carbs_g + (Number(item.carbs_g) || 0),
        }),
        { ...EMPTY_TOTALS },
      ),
    [items],
  )

  const applyResult = (result: ScanResult) => {
    setScan(result)
    setItems(result.items)
    setDescription(result.description)
    setQuota(result.quota ?? null)
    if (result.items.length === 0 && result.questions.length === 0) {
      setPhase('error')
      setError('No food detected — add a little more detail.')
    } else {
      setPhase('review')
    }
  }

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (atLimit) {
      setPhase('error')
      setError(AI_EXHAUSTED_MESSAGE)
      return
    }
    if (aiUnavailable) {
      setPhase('error')
      setError(AI_UNAVAILABLE_MESSAGE)
      return
    }
    if (!file.type.startsWith('image/')) {
      setPhase('error')
      setError('Choose a photo (JPEG, PNG, or WebP).')
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setPhase('error')
      setError('That photo is too large. Try one under 5 MB.')
      return
    }
    setError(null)
    setPhase('scanning')
    try {
      const dataUrl = await fileToDataUrl(file)
      setPreview(dataUrl)
      const result = await api.post<ScanResult>('/fitness/scan', {
        image: dataUrl,
        timezone: detectTimezone(),
      })
      applyResult(result)
    } catch (err) {
      setPhase('error')
      setError(friendlyError(err, 'Scan failed. Try again, or log this meal manually.'))
    }
  }

  const estimateFromText = async () => {
    const text = textInput.trim()
    if (text.length < 2 || busy) return
    if (atLimit) {
      setPhase('error')
      setError(AI_EXHAUSTED_MESSAGE)
      return
    }
    if (aiUnavailable) {
      setPhase('error')
      setError(AI_UNAVAILABLE_MESSAGE)
      return
    }
    setError(null)
    setPreview(null)
    setPhase('scanning')
    try {
      const result = await api.post<ScanResult>('/fitness/scan/text', {
        description: text,
        timezone: detectTimezone(),
      })
      applyResult(result)
    } catch (err) {
      setPhase('error')
      setError(friendlyError(err, 'Could not estimate that meal. Try again, or log it manually.'))
    }
  }

  const updateItem = (index: number, patch: Partial<ScanItem>) => {
    setItems((previous) => previous.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const changeCalories = (index: number, raw: string) => {
    const calories = Math.max(0, Math.round(Number(raw) || 0))
    updateItem(index, withCalorieRange(calories))
  }

  const removeItem = (index: number) => {
    setItems((previous) => previous.filter((_, i) => i !== index))
  }

  const addItem = () => {
    setItems((previous) => [
      ...previous,
      {
        name: '',
        qty: 1,
        unit: 'serving',
        calories: 0,
        calories_low: 0,
        calories_high: 0,
        protein_g: 0,
        fat_g: 0,
        carbs_g: 0,
        confidence: 0.5,
      },
    ])
  }

  const reestimate = async () => {
    const corrected = description.trim()
    if (!scan || !corrected || busy) return
    if (corrected === scan.description) return
    setPhase('scanning')
    setError(null)
    try {
      const updated = await api.post<ScanResult>('/fitness/scan/refine', {
        scan: { ...scan, description: corrected, items, totals },
        description: corrected,
        timezone: detectTimezone(),
      })
      applyResult(updated)
    } catch (err) {
      setPhase('review')
      setError(friendlyError(err, 'Could not rebuild the estimate. Try again, or adjust the items below.'))
    }
  }

  const confirm = async () => {
    if (!scan || items.length === 0 || busy) return
    setPhase('saving')
    setError(null)
    try {
      await api.post('/fitness/log/scan', {
        scan_id: scan.scan_id,
        description,
        items,
        timezone: detectTimezone(),
      })
      onLogged({ calories: Math.round(totals.calories), scanId: scan.scan_id })
      onClose()
    } catch (err) {
      setPhase('review')
      setError(friendlyError(err, 'Could not log this meal. Your items are still here — try again.'))
    }
  }

  if (!open) return null

  const showReview = (phase === 'review' || phase === 'saving') && scan !== null
  const invalidItem = items.some((item) => !item.name.trim())
  const descriptionChanged = scan !== null && description.trim() !== scan.description
  const rangeLow = Math.round(totals.calories_low)
  const rangeHigh = Math.round(totals.calories_high)
  const hasRange = rangeHigh > rangeLow

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="scan-title" className="text-lg font-semibold">
              Add a meal
            </h2>
            <p className="text-[12px] text-muted">
              AI estimate — can be off by 20% or more. Review before logging.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-1 text-muted hover:text-content disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === 'capture' && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="max-w-xs text-[13px] text-muted">
                  Snap your plate and we&apos;ll identify the food. You can fix the description and portions before
                  saving.
                </p>
                <AIUsageMeter quota={quota} configured={configured} className="w-full max-w-xs text-left" />
                {aiUnavailable && (
                  <p className="max-w-xs text-[11px] text-warn">
                    Manual food logging is still available.
                  </p>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void onFile(event)}
                />
                <Button
                  onClick={() => inputRef.current?.click()}
                  disabled={atLimit || aiUnavailable}
                >
                  Take or upload a photo
                </Button>
                <p className="max-w-xs text-[11px] text-muted">
                  The photo isn&apos;t stored. It&apos;s sent to the AI provider once for this estimate.
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted">
                <span className="h-px flex-1 bg-line" />
                or describe it
                <span className="h-px flex-1 bg-line" />
              </div>

              <div>
                <label htmlFor="meal-description" className="block text-[12px] font-medium">
                  What did you eat?
                </label>
                <textarea
                  id="meal-description"
                  className="input mt-1 min-h-[72px] w-full resize-none"
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  placeholder="e.g. two rotis, dal, and a small bowl of rice"
                  maxLength={500}
                />
                <p className="mt-1 text-[11px] text-muted">
                  We&apos;ll break it into ingredients and ask you to fill in the portions.
                </p>
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={() => void estimateFromText()}
                  disabled={textInput.trim().length < 2 || atLimit || aiUnavailable}
                >
                  Estimate from description
                </Button>
                {(atLimit || aiUnavailable) && (
                  <Button
                    variant="secondary"
                    className="mt-2 w-full"
                    onClick={() => {
                      onClose()
                      navigate('/log')
                    }}
                  >
                    Log manually
                  </Button>
                )}
              </div>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {preview && (
                <img src={preview} alt="Meal being analyzed" className="h-40 w-full max-w-xs rounded-lg object-cover" />
              )}
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
                Working out the ingredients…
              </div>
              <p className="text-[11px] text-muted">This usually takes a few seconds.</p>
            </div>
          )}

          {showReview && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                {preview && <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="num text-2xl font-semibold">~{Math.round(totals.calories)}</span>
                    <span className="text-[12px] text-muted">kcal estimated</span>
                  </div>
                  {hasRange && (
                    <p className="num text-[12px] text-muted">
                      Likely range {rangeLow}–{rangeHigh} kcal
                    </p>
                  )}
                  <p className="num text-[12px] text-muted">
                    P {Math.round(totals.protein_g)}g · F {Math.round(totals.fat_g)}g · C{' '}
                    {Math.round(totals.carbs_g)}g
                  </p>
                </div>
              </div>

              <div>
                <label htmlFor="meal-edit-description" className="block text-[12px] font-medium">
                  Meal description
                </label>
                <textarea
                  id="meal-edit-description"
                  className="input mt-1 min-h-[64px] w-full resize-none"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">Wrong dish? Edit it and rebuild the ingredients.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void reestimate()}
                    disabled={!descriptionChanged || !description.trim() || busy}
                  >
                    Re-estimate
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <div key={index} className="rounded-lg border border-line bg-surface-2 p-2.5">
                    <div className="flex gap-2">
                      <Input
                        value={item.name}
                        onChange={(event) => updateItem(index, { name: event.target.value })}
                        placeholder="Ingredient or dish"
                        className="min-w-0 flex-1"
                        aria-label={`Item ${index + 1} name`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="px-2 text-muted hover:text-loss"
                        aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        value={String(item.qty)}
                        onChange={(event) => updateItem(index, { qty: Number(event.target.value) })}
                        aria-label="Quantity"
                      />
                      <Input
                        value={item.unit}
                        onChange={(event) => updateItem(index, { unit: event.target.value })}
                        aria-label="Unit"
                      />
                      <label className="flex items-center gap-1 text-[12px] text-muted">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={String(item.calories)}
                          onChange={(event) => changeCalories(index, event.target.value)}
                          className="w-20"
                          aria-label="Calories"
                        />
                        kcal
                      </label>
                    </div>
                    {item.confidence < 0.6 && (
                      <p className="mt-1 text-[11px] text-warn">Low confidence — double-check this one.</p>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-line p-4 text-center text-[12px] text-muted">
                    {scan.questions.length > 0
                      ? 'Add the missing details above and re-estimate, or add an item below.'
                      : 'No items yet. Add what you ate below.'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={addItem}
                  className="self-start text-[12px] font-medium text-accent hover:underline"
                >
                  + Add item
                </button>
              </div>

              {scan.questions.length > 0 && (
                <div className="rounded-lg border border-warn/30 bg-warn/10 p-3">
                  <p className="text-[12px] font-medium text-content">Fill in the details</p>
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-muted">
                    {scan.questions.map((question, index) => (
                      <li key={index}>
                        {question.item_name ? `${question.item_name}: ` : ''}
                        {question.question}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted">
                    Adjust the quantities below, or put them in the description and re-estimate.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-muted">
                AI estimate — can be off by 20% or more. Check portions before saving.
                {quota ? ` ${aiQuotaSummary(quota)}` : ''}
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="max-w-xs text-[13px] text-muted">{error ?? 'Something went wrong.'}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {scan && items.length > 0 && (
                  <Button variant="secondary" onClick={() => setPhase('review')}>
                    Back to review
                  </Button>
                )}
                <Button variant="secondary" onClick={reset}>
                  Try again
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose()
                    navigate('/log')
                  }}
                >
                  Log manually
                </Button>
              </div>
            </div>
          )}

          {error && showReview && <p className="mt-3 text-[12px] text-loss">{error}</p>}
        </div>

        {showReview && (
          <div className="flex gap-2 border-t border-line px-5 py-4">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => void confirm()}
              loading={phase === 'saving'}
              disabled={items.length === 0 || invalidItem || phase === 'saving'}
            >
              Log meal
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
