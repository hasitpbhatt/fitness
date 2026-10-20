import { useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useModalFocus } from '../../lib/useModalFocus'
import { Button, Input } from '../ui'
import type { MacroTargets } from '../../lib/types'

type Props = {
  targets: MacroTargets | null
  onClose: () => void
  onSaved: (targets: MacroTargets) => void
}

function toInput(value: number | null | undefined) {
  return value == null ? '' : String(value)
}

export function MacroTargetsModal({ targets, onClose, onSaved }: Props) {
  const [calories, setCalories] = useState(toInput(targets?.calorie_target))
  const [protein, setProtein] = useState(toInput(targets?.protein_target_g))
  const [carbs, setCarbs] = useState(toInput(targets?.carbs_target_g))
  const [fat, setFat] = useState(toInput(targets?.fat_target_g))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(true, dialogRef, onClose, busy)

  function parseTarget(raw: string, label: string, max: number): number | null {
    if (!raw.trim()) return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || value > max) {
      throw new Error(`${label} must be between 0 and ${max.toLocaleString('en-US')}.`)
    }
    return value
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.put<{ targets: MacroTargets }>('/fitness/targets', {
        calorie_target: parseTarget(calories, 'Calories', 20_000),
        protein_target_g: parseTarget(protein, 'Protein', 1_000),
        carbs_target_g: parseTarget(carbs, 'Carbs', 1_000),
        fat_target_g: parseTarget(fat, 'Fat', 1_000),
      })
      onSaved(saved.targets)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your targets.')
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
        aria-labelledby="macro-targets-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="macro-targets-title" className="text-lg font-semibold">
          Daily nutrition targets
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Leave a field empty to stop tracking that target.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="target-calories" className="block text-[12px] font-medium">
              Calories (kcal)
            </label>
            <Input
              id="target-calories"
              type="number"
              inputMode="numeric"
              min={0}
              className="mt-1"
              value={calories}
              onChange={(event) => {
                setCalories(event.target.value)
                setError(null)
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="target-protein" className="block text-[12px] font-medium">
                Protein (g)
              </label>
              <Input
                id="target-protein"
                type="number"
                inputMode="decimal"
                min={0}
                className="mt-1"
                value={protein}
                onChange={(event) => {
                  setProtein(event.target.value)
                  setError(null)
                }}
              />
            </div>
            <div>
              <label htmlFor="target-carbs" className="block text-[12px] font-medium">
                Carbs (g)
              </label>
              <Input
                id="target-carbs"
                type="number"
                inputMode="decimal"
                min={0}
                className="mt-1"
                value={carbs}
                onChange={(event) => {
                  setCarbs(event.target.value)
                  setError(null)
                }}
              />
            </div>
            <div>
              <label htmlFor="target-fat" className="block text-[12px] font-medium">
                Fat (g)
              </label>
              <Input
                id="target-fat"
                type="number"
                inputMode="decimal"
                min={0}
                className="mt-1"
                value={fat}
                onChange={(event) => {
                  setFat(event.target.value)
                  setError(null)
                }}
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-loss">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Save targets
          </Button>
        </div>
      </div>
    </div>
  )
}
