import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Input, Textarea } from '../components/ui'
import { Alert, ConfirmDialog, EmptyState } from '../components/feedback'
import type { AdminNotification } from '../lib/types'

type FormState = {
  title: string
  body: string
  url: string
  audience: AdminNotification['audience']
  sendAt: string
  sticky: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  body: '',
  url: '',
  audience: 'all',
  sendAt: '',
  sticky: false,
}

const AUDIENCE_LABELS: Record<AdminNotification['audience'], string> = {
  all: 'All members',
  free: 'Free tier',
  pro: 'Pro tier',
  enterprise: 'Enterprise tier',
  test: 'Test (you)',
}

function statusClass(status: AdminNotification['status']) {
  if (status === 'sent') return 'bg-gain/10 text-gain'
  if (status === 'scheduled') return 'bg-accent/10 text-accent'
  if (status === 'cancelled') return 'bg-loss/10 text-loss'
  return 'bg-surface-2 text-muted'
}

function formatTime(value: number | null) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AdminNotifications() {
  const { user, loading } = useAuth()
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSend, setConfirmSend] = useState<AdminNotification | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setFetching(true)
    try {
      const result = await api.get<{ notifications: AdminNotification[] }>('/admin/notifications')
      setNotifications(result.notifications)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load notifications.')
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- load the admin feed after auth
    if (user?.role === 'admin') void refresh()
  }, [refresh, user])

  if (loading) {
    return <div className="h-96 animate-pulse rounded-xl border border-line bg-surface" />
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Admin notifications</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in with an admin account.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </Card>
    )
  }

  if (user.role !== 'admin') {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-2 text-[13px] text-muted">This page composes in-app notifications.</p>
        <Link to="/dashboard" className="btn-secondary mt-4 inline-flex">Back to dashboard</Link>
      </Card>
    )
  }

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    if (!form.title.trim() || !form.body.trim()) {
      setError('Add a title and message.')
      return
    }
    const sendAt = form.sendAt ? new Date(form.sendAt).getTime() : null
    if (form.sendAt && (!sendAt || !Number.isFinite(sendAt))) {
      setError('Pick a valid schedule time.')
      return
    }
    setBusy(true)
    try {
      const result = await api.post<{ id: string; status: string }>('/admin/notifications', {
        title: form.title.trim(),
        body: form.body.trim(),
        url: form.url.trim() || null,
        audience: form.audience,
        sticky: form.sticky,
        send_at: sendAt,
      })
      setMessage(
        result.status === 'sent'
          ? 'Notification sent.'
          : result.status === 'scheduled'
            ? 'Notification scheduled.'
            : 'Draft saved.',
      )
      setForm(EMPTY_FORM)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the notification.')
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, action: 'send' | 'cancel' | 'test') => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post(`/admin/notifications/${id}/${action}`)
      setMessage(
        action === 'send'
          ? 'Notification sent.'
          : action === 'cancel'
            ? 'Notification cancelled.'
            : 'Test notification queued for your account.',
      )
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the notification.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="mt-1 text-[13px] text-muted">
          Compose in-app popups and banners, schedule delivery, and watch views.
        </p>
      </div>

      {(message || error) && (
        <Alert tone={error ? 'danger' : 'success'}>{error ?? message}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <form onSubmit={(event) => void create(event)} className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="font-semibold">Compose</h2>
              <p className="text-[12px] text-muted">Banners stay until dismissed; popups show once per session.</p>
            </div>
            <Input
              placeholder="Title"
              value={form.title}
              maxLength={120}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            <Textarea
              placeholder="What should members know?"
              rows={4}
              value={form.body}
              maxLength={500}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            />
            <Input
              placeholder="Link (optional), e.g. /dashboard"
              value={form.url}
              maxLength={200}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-[12px] text-muted">
                Audience
                <select
                  className="input mt-1"
                  value={form.audience}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    audience: event.target.value as FormState['audience'],
                  }))}
                >
                  {Object.entries(AUDIENCE_LABELS)
                    .filter(([value]) => value !== 'test')
                    .map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                </select>
              </label>
              <label className="text-[12px] text-muted">
                Schedule
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={form.sendAt}
                  onChange={(event) => setForm((current) => ({ ...current, sendAt: event.target.value }))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-content">
              <input
                type="checkbox"
                checked={form.sticky}
                onChange={(event) => setForm((current) => ({ ...current, sticky: event.target.checked }))}
              />
              Sticky banner
            </label>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted">Leave the schedule blank to save a draft.</p>
              <Button type="submit" loading={busy}>Save</Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="font-semibold">Sent &amp; scheduled</h2>
              <p className="text-[12px] text-muted">Views count unique members who saw it.</p>
            </div>
            <Button variant="secondary" size="sm" loading={fetching} onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
          {notifications.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Nothing composed yet"
              description="Write a message on the left and save it as a draft."
            />
          ) : (
            <div className="divide-y divide-line">
              {notifications.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{item.body}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>{AUDIENCE_LABELS[item.audience] ?? item.audience}</span>
                    <span>{formatTime(item.send_at)}</span>
                    {item.sticky === 1 && <span>Banner</span>}
                    <span>{item.views} views</span>
                    <span>{item.dismissals} dismissed</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status !== 'sent' && item.status !== 'cancelled' && (
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => setConfirmSend(item)}>
                        Send now
                      </Button>
                    )}
                    {item.status !== 'sent' && item.status !== 'cancelled' && (
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => void act(item.id, 'cancel')}>
                        Cancel
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => void act(item.id, 'test')}>
                      Test
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={confirmSend !== null}
        title="Send this notification now?"
        description={
          confirmSend
            ? `"${confirmSend.title}" will be delivered to ${AUDIENCE_LABELS[confirmSend.audience] ?? confirmSend.audience} straight away.`
            : undefined
        }
        confirmLabel="Send now"
        busy={busy}
        onCancel={() => setConfirmSend(null)}
        onConfirm={() => {
          if (confirmSend) void act(confirmSend.id, 'send')
          setConfirmSend(null)
        }}
      />
    </div>
  )
}
