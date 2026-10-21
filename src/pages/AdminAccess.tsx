import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card, Input } from '../components/ui'
import type { EntitlementStatus, FitnessTier } from '../lib/types'

type AccessMember = {
  user_id: string
  email: string
  username: string
  display_name: string | null
  role: string
  created_at: number
  entitlement_updated_at: number | null
  tier: FitnessTier
  tier_label: string
  status: EntitlementStatus
  is_active: boolean
  trial_ends_at: number | null
  ends_at: number | null
  note: string | null
  source: 'admin' | 'grant' | 'default'
  features: { ai_tools: boolean }
}

type AccessResponse = {
  members: AccessMember[]
  server_time: number
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
  { value: 'revoked', label: 'Revoked' },
] as const

function formatDate(value: number | null): string {
  if (value == null) return 'No expiry'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Badge({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'accent' | 'warn'
}) {
  const className =
    tone === 'accent'
      ? 'bg-accent/10 text-accent'
      : tone === 'warn'
        ? 'bg-warn/10 text-warn'
        : 'bg-surface-2 text-muted'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
  )
}

function AccessEditor({ member, onSaved }: { member: AccessMember; onSaved: () => void }) {
  const [tier, setTier] = useState<FitnessTier>(member.tier)
  const [status, setStatus] = useState<'active' | 'trial' | 'revoked'>(
    member.status === 'trial' || member.status === 'revoked' ? member.status : 'active',
  )
  const [trialDays, setTrialDays] = useState('14')
  const [note, setNote] = useState(member.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (nextTier = tier, nextStatus = status) => {
    setBusy(true)
    setError(null)
    try {
      await api.put(`/admin/entitlements/${member.user_id}`, {
        tier: nextTier,
        status: nextTier === 'free' ? 'active' : nextStatus,
        trial_days: Number(trialDays) || 14,
        note: note.trim() || undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update access.')
    } finally {
      setBusy(false)
    }
  }

  if (member.role === 'admin') {
    return (
      <p className="text-[11px] text-muted">
        Admin access is automatic. No grant is needed for this account.
      </p>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
          Tier
          <select
            className="input h-9 w-28 text-[12px]"
            value={tier}
            onChange={(event) => setTier(event.target.value as FitnessTier)}
          >
            <option value="free">Free</option>
            <option value="plus">Plus</option>
            <option value="coach">Coach</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
          Status
          <select
            className="input h-9 w-28 text-[12px]"
            value={status}
            disabled={tier === 'free'}
            onChange={(event) => setStatus(event.target.value as 'active' | 'trial' | 'revoked')}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {tier !== 'free' && status === 'trial' && (
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
            Trial days
            <Input
              type="number"
              min={1}
              max={90}
              value={trialDays}
              onChange={(event) => setTrialDays(event.target.value)}
              className="h-9 w-24 text-[12px]"
            />
          </label>
        )}
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] uppercase tracking-wide text-muted">
          Staff note
          <Input
            value={note}
            maxLength={200}
            placeholder="Optional, visible to the member"
            onChange={(event) => setNote(event.target.value)}
            className="h-9 text-[12px]"
          />
        </label>
        <Button type="button" size="sm" loading={busy} onClick={() => void save()}>
          Save
        </Button>
        {member.is_active && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void save(member.tier === 'free' ? 'plus' : member.tier, 'revoked')}
          >
            Revoke
          </Button>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-loss" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export default function AdminAccess() {
  const { user, loading } = useAuth()
  const [members, setMembers] = useState<AccessMember[] | null>(null)
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
    api
      .get<AccessResponse>(`/admin/entitlements?${params.toString()}`)
      .then((result) => {
        if (!active) return
        setMembers(result.members)
        setError(null)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load access levels.')
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
      <div
        className="mx-auto flex max-w-5xl flex-col gap-4"
        role="status"
        aria-label="Loading access"
      >
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Access</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in with an admin account.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">
          Sign in
        </Link>
      </Card>
    )
  }

  if (user.role !== 'admin') {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-2 text-[13px] text-muted">Access levels are managed by admins.</p>
        <Link to="/dashboard" className="btn-secondary mt-4 inline-flex">
          Back to dashboard
        </Link>
      </Card>
    )
  }

  const search = (event: React.FormEvent) => {
    event.preventDefault()
    setFetching(true)
    const next = query.trim()
    if (next === appliedQuery) {
      setRetryKey((key) => key + 1)
      return
    }
    setAppliedQuery(next)
  }

  const refresh = () => {
    setFetching(true)
    setRetryKey((key) => key + 1)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Access</h1>
          <p className="mt-1 text-[13px] text-muted">
            Staff-provisioned Plus access. No payments or self-serve checkout.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/members" className="btn-secondary">
            Members
          </Link>
          <Link to="/admin/notifications" className="btn-secondary">
            Notifications
          </Link>
        </div>
      </div>

      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <label htmlFor="access-search" className="sr-only">
          Search members
        </label>
        <Input
          id="access-search"
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
        <div
          className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-[12px] text-loss"
          role="alert"
        >
          {error}
        </div>
      )}

      {members && (
        <p className="text-[12px] text-muted" aria-live="polite">
          {members.length} member{members.length === 1 ? '' : 's'}
          {appliedQuery ? ` matching "${appliedQuery}"` : ''}. AI tools require Plus or Coach.
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
              <div key={member.user_id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[13px] font-semibold">
                        {member.display_name || member.username}
                      </p>
                      <Badge tone={member.role === 'admin' ? 'accent' : 'muted'}>
                        {member.role}
                      </Badge>
                      <Badge tone={member.is_active ? 'accent' : 'warn'}>{member.tier_label}</Badge>
                      <Badge>{member.status}</Badge>
                    </div>
                    <p className="truncate text-[12px] text-muted">
                      {member.email} @{member.username}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {member.status === 'trial'
                        ? `Trial ends ${formatDate(member.ends_at)}`
                        : member.ends_at
                          ? `Access ends ${formatDate(member.ends_at)}`
                          : member.source === 'admin'
                            ? 'Admin access never expires'
                            : 'No expiry'}
                      {member.entitlement_updated_at
                        ? ` - updated ${formatDate(member.entitlement_updated_at)}`
                        : ''}
                    </p>
                    {member.note && (
                      <p className="mt-1 text-[11px] text-muted">Note: {member.note}</p>
                    )}
                  </div>
                </div>
                <AccessEditor member={member} onSaved={refresh} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!members && fetching && (
        <div
          className="h-64 animate-pulse rounded-xl border border-line bg-surface"
          role="status"
          aria-label="Loading access levels"
        />
      )}
    </div>
  )
}
