import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Card } from '../components/ui'

type Summary = {
  calls: number
  successes: number
  failures: number
  success_rate: number | null
  quota_blocks: number
  latency_ms: { p50: number | null; p95: number | null }
  errors: Record<string, number>
  by_surface?: Record<string, { calls: number; successes: number; p95_ms: number | null }>
}

type Analytics = {
  window: { days: number; start: string; end: string }
  members: { total: number; new: number; onboarded: number; onboarded_pct: number | null }
  activity: {
    dau: number
    wau: number
    mau: number
    active: number
    returning: number
    series: Array<{ date: string; logs: number; active: number }>
  }
  funnel: {
    estimate_attempts: number
    estimate_successes: number
    meals_logged: number
    logged_per_success: number | null
  }
  reliability: {
    sampled: boolean
    sample_limit: number
    scan: Summary
    coach: Summary
  }
  access: { grants: Array<{ tier: string; status: string; count: number }> }
  server_time: number
}

const number = new Intl.NumberFormat('en-US')

function metric(value: number | null, suffix = ''): string {
  return value == null ? '-' : `${number.format(value)}${suffix}`
}

function Stats({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="num mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted">{note}</p>}
    </div>
  )
}

function Reliability({ title, summary }: { title: string; summary: Summary }) {
  const errors = Object.entries(summary.errors).slice(0, 6)
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="text-[11px] text-muted">
          {metric(summary.success_rate, '%')} success
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="num text-[15px] font-semibold">{number.format(summary.calls)}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">Calls</p>
        </div>
        <div>
          <p className="num text-[15px] font-semibold">{number.format(summary.successes)}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">OK</p>
        </div>
        <div>
          <p className="num text-[15px] font-semibold">{number.format(summary.failures)}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted">Failed</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        p50 {metric(summary.latency_ms.p50, ' ms')} / p95 {metric(summary.latency_ms.p95, ' ms')}
        {summary.quota_blocks > 0 ? ` / ${number.format(summary.quota_blocks)} quota blocks` : ''}
      </p>
      {summary.by_surface && Object.keys(summary.by_surface).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(summary.by_surface).map(([surface, value]) => (
            <span
              key={surface}
              className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted"
            >
              {surface}: {number.format(value.successes)}/{number.format(value.calls)}
            </span>
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {errors.map(([key, count]) => (
            <p key={key} className="truncate text-[10px] text-muted" title={key}>
              {key.replace(':', ' ')} x{number.format(count)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminAnalytics() {
  const { user, loading } = useAuth()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (user?.role !== 'admin') return
    let active = true
    api
      .get<Analytics>(`/admin/analytics?days=${days}`)
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch(() => {
        if (!active) return
        setError('Could not load analytics.')
      })
      .finally(() => {
        if (active) setFetching(false)
      })
    return () => {
      active = false
    }
  }, [user, days, retryKey])

  if (loading) {
    return (
      <div
        className="mx-auto flex max-w-5xl flex-col gap-4"
        role="status"
        aria-label="Loading analytics"
      >
        <div className="h-24 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Analytics</h1>
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
        <p className="mt-2 text-[13px] text-muted">Analytics are available to admins.</p>
        <Link to="/dashboard" className="btn-secondary mt-4 inline-flex">
          Back to dashboard
        </Link>
      </Card>
    )
  }

  const maxActive = Math.max(1, ...(data?.activity.series.map((day) => day.active) ?? [1]))

  // 90 bars in a 320px phone is an illegible smear, so a long window is
  // bucketed into weeks. The bar count stays readable at every width.
  const chartBucketed = (data?.activity.series.length ?? 0) > 30
  const chartBars = (() => {
    const series = data?.activity.series ?? []
    if (!chartBucketed) {
      return series.map((day) => ({
        key: day.date,
        value: day.active,
        title: `${day.date}: ${day.active} active, ${day.logs} logs`,
      }))
    }
    const buckets: Array<{ key: string; value: number; title: string }> = []
    for (let index = 0; index < series.length; index += 7) {
      const week = series.slice(index, index + 7)
      const active = Math.round(week.reduce((sum, day) => sum + day.active, 0) / week.length)
      buckets.push({
        key: week[0].date,
        value: active,
        title: `${week[0].date} to ${week[week.length - 1].date}: ${active} active on average`,
      })
    }
    return buckets
  })()

  const changeDays = (next: number) => {
    if (next === days) return
    setFetching(true)
    setDays(next)
  }

  const refresh = () => {
    setFetching(true)
    setRetryKey((key) => key + 1)
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="mt-1 text-[13px] text-muted">
            Funnel, reliability, activity, and provisioned access. No meal descriptions, photos, or
            chat text are stored.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/members" className="btn-secondary">
            Members
          </Link>
          <Link to="/admin/access" className="btn-secondary">
            Access
          </Link>
          <Link to="/admin/notifications" className="btn-secondary">
            Notifications
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="analytics-days" className="sr-only">
          Window
        </label>
        <select
          id="analytics-days"
          className="input h-9 w-32 text-[12px]"
          value={days}
          onChange={(event) => changeDays(Number(event.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={fetching}>
          Refresh
        </Button>
        {data && (
          <p className="text-[11px] text-muted" aria-live="polite">
            {data.window.start} to {data.window.end}
          </p>
        )}
      </div>

      {error && (
        <div
          className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-[12px] text-loss"
          role="alert"
        >
          {error}
        </div>
      )}

      {data && (
        <div className={`flex flex-col gap-4 ${fetching ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stats
              label="New members"
              value={number.format(data.members.new)}
              note={`${number.format(data.members.total)} total profiles`}
            />
            <Stats
              label="Active members"
              value={number.format(data.activity.active)}
              note={`${number.format(data.activity.returning)} logged on 2+ days`}
            />
            <Stats
              label="Onboarded"
              value={metric(data.members.onboarded_pct, '%')}
              note={`${number.format(data.members.onboarded)} completed setup`}
            />
            <Stats
              label="DAU / WAU / MAU"
              value={`${number.format(data.activity.dau)} / ${number.format(data.activity.wau)} / ${number.format(data.activity.mau)}`}
              note="By local log date"
            />
            <Stats
              label="Scan success"
              value={metric(data.reliability.scan.success_rate, '%')}
              note={`${number.format(data.reliability.scan.successes)} of ${number.format(data.reliability.scan.calls)} attempts`}
            />
            <Stats
              label="Scan p95"
              value={metric(data.reliability.scan.latency_ms.p95, ' ms')}
              note="Includes quota and upstream time"
            />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold">Active members by day</h2>
              <span className="text-[11px] text-muted">
                {number.format(data.activity.series.reduce((sum, day) => sum + day.logs, 0))} logs
              </span>
            </div>
            <div className="mt-4 flex h-28 items-end gap-[2px]" role="img" aria-label="Daily active members">
              {chartBars.map((bar) => (
                <div
                  key={bar.key}
                  className="min-h-[2px] flex-1 rounded-t bg-accent/70"
                  style={{ height: `${Math.max(2, (bar.value / maxActive) * 100)}%` }}
                  title={bar.title}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted">
              <span>{data.activity.series[0]?.date}</span>
              {chartBucketed && <span>weekly average</span>}
              <span>{data.activity.series[data.activity.series.length - 1]?.date}</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-[13px] font-semibold">AI estimate funnel</h2>
              <div className="mt-3 space-y-3">
                {[
                  { label: 'Estimates attempted', value: data.funnel.estimate_attempts },
                  { label: 'Estimates succeeded', value: data.funnel.estimate_successes },
                  { label: 'Meals logged from estimates', value: data.funnel.meals_logged },
                ].map((step) => {
                  const width =
                    data.funnel.estimate_attempts > 0
                      ? Math.max(2, (step.value / data.funnel.estimate_attempts) * 100)
                      : 0
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">{step.label}</span>
                        <span className="num font-medium">{number.format(step.value)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-surface-2">
                        <div
                          className="h-2 rounded-full bg-accent/70"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-[11px] text-muted">
                Logged per successful estimate: {metric(data.funnel.logged_per_success, '%')}. Server
                stages only; review is client-side.
              </p>
            </Card>

            <div className="flex flex-col gap-3">
              <Reliability title="Scan and food search" summary={data.reliability.scan} />
              <Reliability title="AI coach" summary={data.reliability.coach} />
            </div>
          </div>

          {data.reliability.sampled && (
            <p className="text-[11px] text-muted">
              Reliability and funnel are based on the latest{' '}
              {number.format(data.reliability.sample_limit)} events in this window.
            </p>
          )}

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold">Provisioned access</h2>
            {data.access.grants.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted">No explicit grants yet.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.access.grants.map((grant) => (
                  <span
                    key={`${grant.tier}:${grant.status}`}
                    className="rounded border border-line bg-surface-2 px-2 py-1 text-[11px]"
                  >
                    {grant.tier} / {grant.status}: {number.format(grant.count)}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-muted">
              Members without a row are free; admins always have coach access.
            </p>
          </Card>
        </div>
      )}

      {!data && fetching && (
        <div
          className="h-64 animate-pulse rounded-xl border border-line bg-surface"
          role="status"
          aria-label="Loading analytics data"
        />
      )}
    </div>
  )
}
