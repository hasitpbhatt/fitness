import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Input } from '../components/ui'

type Member = {
  id: string
  email: string
  username: string
  display_name: string | null
  role: string
  tier: string
  created_at: number
  timezone: string | null
  timezone_source: string | null
  onboarding_complete: boolean
  goal_count: number
  last_log_date: string | null
  logs_7d: number
}

type MembersResponse = {
  members: Member[]
  window_start: string
  generated_at: number
}

function formatDate(value: string | number | null): string {
  if (value == null) return 'Never'
  const date = typeof value === 'number' ? new Date(value) : new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: typeof value === 'string' ? 'UTC' : undefined,
  })
}

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' | 'warn' }) {
  const className =
    tone === 'accent'
      ? 'bg-accent/10 text-accent'
      : tone === 'warn'
        ? 'bg-warn/10 text-warn'
        : 'bg-surface-2 text-muted'
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
}

export default function AdminMembers() {
  const { user, loading } = useAuth()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (user?.role !== 'admin') return
    let active = true
    const params = new URLSearchParams({ limit: '100' })
    if (appliedQuery) params.set('q', appliedQuery)
    api.get<MembersResponse>(`/admin/members?${params.toString()}`)
      .then((result) => {
        if (!active) return
        setMembers(result.members)
        setError(null)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load members.')
      })
      .finally(() => {
        if (active) setFetching(false)
      })
    return () => {
      active = false
    }
  }, [user, appliedQuery, retryKey])

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4" role="status" aria-label="Loading members">
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Members</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in with an admin account.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </Card>
    )
  }

  if (user.role !== 'admin') {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-2 text-[13px] text-muted">This directory is available to admins.</p>
        <Link to="/dashboard" className="btn-secondary mt-4 inline-flex">Back to dashboard</Link>
      </Card>
    )
  }

  const search = (event: React.FormEvent) => {
    event.preventDefault()
    const next = query.trim()
    if (next === appliedQuery) {
      setRetryKey((key) => key + 1)
      setFetching(true)
      return
    }
    setAppliedQuery(next)
    setFetching(true)
  }

  const refresh = () => {
    setRetryKey((key) => key + 1)
    setFetching(true)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="mt-1 text-[13px] text-muted">
            Read-only support view of signups, timezone confirmation, goals, and recent logging.
          </p>
        </div>
        <Link to="/admin/notifications" className="btn-secondary">
          Notifications
        </Link>
      </div>

      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <label htmlFor="member-search" className="sr-only">Search members</label>
        <Input
          id="member-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, username, or email"
          className="max-w-sm flex-1"
        />
        <Button type="submit" size="sm" loading={fetching}>
          Search
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={fetching}>
          Refresh
        </Button>
      </form>

      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-[12px] text-loss" role="alert">
          {error}
        </div>
      )}

      {members && (
        <p className="text-[12px] text-muted" aria-live="polite">
          {members.length} member{members.length === 1 ? '' : 's'}
          {appliedQuery ? ` matching “${appliedQuery}”` : ''}. 7-day counts use local log dates.
        </p>
      )}

      {members && members.length === 0 && !fetching && (
        <Card className="p-8 text-center">
          <p className="text-[14px] font-medium">No members match that search.</p>
          <p className="mt-1 text-[12px] text-muted">Try a name, username, or email.</p>
        </Card>
      )}

      {members && members.length > 0 && (
        <Card className={`overflow-hidden ${fetching ? 'opacity-60' : ''}`}>
          <div className="divide-y divide-line">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-[13px] font-semibold">
                      {member.display_name || member.username}
                    </p>
                    <Badge tone={member.role === 'admin' ? 'accent' : 'muted'}>{member.role}</Badge>
                    <Badge>{member.tier}</Badge>
                    <Badge tone={member.onboarding_complete ? 'accent' : 'warn'}>
                      {member.onboarding_complete ? 'onboarded' : 'setup pending'}
                    </Badge>
                  </div>
                  <p className="truncate text-[12px] text-muted">
                    {member.email} · @{member.username}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {member.timezone ?? 'UTC'}
                    {member.timezone_source === 'user' ? ' (confirmed)' : ' (auto)'} · joined {formatDate(member.created_at)}
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-4 text-right">
                  <div>
                    <p className="num text-[13px] font-semibold">{member.goal_count}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Goals</p>
                  </div>
                  <div>
                    <p className="num text-[13px] font-semibold">{member.logs_7d}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Logs 7d</p>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold">{member.last_log_date ? formatDate(member.last_log_date) : 'Never'}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted">Last log</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!members && fetching && (
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" role="status" aria-label="Loading member directory" />
      )}
    </div>
  )
}
