import { useState } from 'react'
import { api } from '../lib/api'
import type { Preferences } from '../lib/types'
import { Button, Card, Input } from './ui'
import { ConfirmDialog } from './feedback'

type Props = {
  preferences: Preferences | null
  onChange: (preferences: Preferences | null) => void
}

type TagGroup = 'diets' | 'allergens' | 'avoid' | 'likes'

const GROUPS: Array<{ key: TagGroup; label: string }> = [
  { key: 'diets', label: 'Diet' },
  { key: 'allergens', label: 'Allergies' },
  { key: 'avoid', label: 'Avoid' },
  { key: 'likes', label: 'Likes' },
]

function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-content">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted hover:text-loss"
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      )}
    </span>
  )
}

/**
 * Shows what the coach has learned about the member's diet and lets them fix
 * it. Whatever is listed here is applied to every scan, food search, meal plan
 * and coach reply.
 */
export function PreferencesPanel({ preferences, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [notes, setNotes] = useState(preferences?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)

  const diets = preferences?.diets ?? []
  const allergens = preferences?.allergens ?? []
  const avoid = preferences?.avoid ?? []
  const likes = preferences?.likes ?? []

  const total = diets.length + allergens.length + avoid.length + likes.length + (preferences?.notes ? 1 : 0)

  const save = async (next: Preferences) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.put<{ preferences: Preferences }>('/fitness/preferences', {
        preferences: next,
      })
      onChange(result.preferences)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preferences.')
    } finally {
      setBusy(false)
    }
  }

  const removeTag = async (group: TagGroup, value: string) => {
    if (!preferences) return
    const next = { ...preferences, [group]: preferences[group].filter((tag: string) => tag !== value) }
    await save(next)
  }

  const addTag = async () => {
    const value = draft.trim().toLowerCase()
    if (!value || !preferences) return
    const group = GROUPS.find((g) => (preferences[g.key] as string[]).length === 0) ?? GROUPS[0]
    const next = { ...preferences, [group.key]: [...preferences[group.key], value] }
    setDraft('')
    await save(next)
  }

  const forget = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.del('/fitness/preferences')
      onChange(null)
      setEditing(false)
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear your preferences.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold">Personalization</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Your coach learns these from your chats and uses them for every scan, search and plan.
          </p>
        </div>
        {preferences && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={busy}>
            Edit
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-[12px] text-loss">{error}</p>}

      {!preferences && !editing && (
        <p className="mt-3 text-[12px] text-muted">
          Nothing learned yet. Tell your coach how you eat — for example &quot;I&apos;m vegetarian and
          can&apos;t eat gluten&quot; — and it will remember for next time.
        </p>
      )}

      {preferences && (
        <div className="mt-3 space-y-2">
          {GROUPS.map((group) => {
            const values = preferences[group.key]
            if (!values.length) return null
            return (
              <div key={group.key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 text-[11px] uppercase tracking-wide text-muted">{group.label}</span>
                {values.map((value) => (
                  <Tag
                    key={value}
                    label={value}
                    onRemove={editing ? () => void removeTag(group.key, value) : undefined}
                  />
                ))}
              </div>
            )
          })}
          {preferences.notes && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 text-[11px] uppercase tracking-wide text-muted">Notes</span>
              <Tag
                label={preferences.notes}
                onRemove={editing ? () => void save({ ...preferences, notes: '' }) : undefined}
              />
            </div>
          )}
          {total === 0 && (
            <p className="text-[12px] text-muted">No preferences saved yet.</p>
          )}
        </div>
      )}

      {editing && preferences && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <div>
            <label htmlFor="pref-new" className="block text-[11px] font-medium">
              Add a preference
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="pref-new"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. vegetarian, gluten, paneer"
                className="flex-1"
                maxLength={60}
              />
              <Button variant="secondary" onClick={() => void addTag()} disabled={busy || !draft.trim()}>
                Add
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor="pref-notes" className="block text-[11px] font-medium">
              Notes
            </label>
            <Input
              id="pref-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything else the coach should know"
              maxLength={200}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save({ ...preferences, notes })} loading={busy} disabled={busy}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => setConfirmForget(true)} disabled={busy} className="text-loss">
              Forget everything
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmForget}
        title="Forget everything the coach learned?"
        description="Your diet, allergies and food preferences are removed. You can teach the coach again any time."
        confirmLabel="Forget everything"
        busy={busy}
        onCancel={() => setConfirmForget(false)}
        onConfirm={() => {
          setConfirmForget(false)
          void forget()
        }}
      />
    </Card>
  )
}
