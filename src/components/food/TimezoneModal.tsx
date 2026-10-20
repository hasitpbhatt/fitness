import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { formatTimezoneLabel, timezoneOptions } from '../../lib/timezone'
import { useModalFocus } from '../../lib/useModalFocus'
import { Button, Input } from '../ui'

type Props = {
  open: boolean
  current: string
  onClose: () => void
  onSaved: (timezone: string) => void
}

export function TimezoneModal({ open, current, onClose, onSaved }: Props) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = useMemo(() => timezoneOptions(), [])
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(open, dialogRef, onClose, busy)

  useEffect(() => {
    if (open) {
      setValue(current)
      setError(null)
    }
  }, [open, current])

  if (!open) return null

  const save = async () => {
    if (!value.trim()) return
    setBusy(true)
    setError(null)
    try {
      const saved = await api.put<{ timezone: string }>('/fitness/profile', { timezone: value.trim() })
      onSaved(saved.timezone)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that timezone.')
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
        aria-labelledby="timezone-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 shadow-xl sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="timezone-title" className="text-lg font-semibold">
          Your timezone
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          Your day, streak, and weekly totals roll over at midnight here. Changing it re-dates entries from before
          your first confirmation.
        </p>

        <label htmlFor="timezone-input" className="mt-4 block text-[12px] font-medium">
          Timezone
        </label>
        <Input
          id="timezone-input"
          list="timezone-options"
          className="mt-1"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          placeholder="Asia/Kolkata"
          autoComplete="off"
        />
        <datalist id="timezone-options">
          {options.map((timezone) => (
            <option key={timezone} value={timezone} />
          ))}
        </datalist>
        <p className="mt-1 text-[12px] text-muted">{formatTimezoneLabel(value.trim() || 'UTC')}</p>

        {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!value.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
