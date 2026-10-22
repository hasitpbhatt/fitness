import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AIUsageMeter } from '../components/ai/AIUsageMeter'
import { Button, Card, Textarea } from '../components/ui'
import { AI_COACH_LIMIT, COACH_EXHAUSTED_MESSAGE, COACH_OUT_OF_CREDITS_MESSAGE, COACH_QUOTA_NOTE, COACH_UNAVAILABLE_MESSAGE, aiExhausted } from '../lib/aiUsage'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useEntitlement } from '../lib/useEntitlement'
import type { CoachMessage, ScanQuota } from '../lib/types'

const STARTERS = [
  'What should I eat to hit my protein target today?',
  'Review my last 7 days and suggest one change.',
  'I only have 20 minutes. What workout fits?',
  'How can I sleep better tonight?',
]

export default function Coach() {
  const { user, loading } = useAuth()
  const entitlement = useEntitlement(user?.id)
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [input, setInput] = useState('')
  const [quota, setQuota] = useState<ScanQuota | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    api.get<{ quota: ScanQuota; configured: boolean }>('/fitness/coach/quota')
      .then((result) => {
        if (!active) return
        setQuota(result.quota)
        setConfigured(result.configured)
      })
      .catch(() => {
        // The meter is advisory; the chat endpoint remains authoritative.
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, sending])

  if (loading) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading coach">
        <div className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
        <div className="h-96 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">AI coach</h1>
        <p className="mt-2 text-[13px] text-muted">Sign in to ask questions grounded in your recent progress.</p>
        <Link to="/login" className="btn-primary mt-4 inline-flex">Sign in with Google</Link>
      </Card>
    )
  }

  if (entitlement !== null && !entitlement.features.ai_tools) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center">
          <p className="text-[11px] uppercase tracking-wide text-muted">Plus feature</p>
          <h1 className="mt-1 text-xl font-semibold">The AI coach is part of Plus</h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
            Ask your coach to enable access. Manual logging, goals, meal plans, habits, and the
            food database stay free.
          </p>
          <Link to="/" className="btn-primary mt-5 inline-flex">
            Back to dashboard
          </Link>
        </Card>
      </div>
    )
  }

  const blocked = aiExhausted(quota) || configured === false

  const ask = async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed || sending) return
    if (blocked) {
      setError(configured === false ? COACH_UNAVAILABLE_MESSAGE : COACH_EXHAUSTED_MESSAGE)
      return
    }
    const previous = messages
    const outgoing: CoachMessage[] = [...previous, { role: 'user', content: trimmed }]
    setMessages(outgoing)
    setInput('')
    setError(null)
    setSending(true)
    try {
      const result = await api.post<{ reply: string; quota: ScanQuota }>('/fitness/coach', {
        messages: outgoing,
      })
      setMessages([...outgoing, { role: 'assistant', content: result.reply }])
      setQuota(result.quota)
    } catch (err) {
      setMessages(previous)
      setInput(trimmed)
      if (err instanceof ApiError && err.status === 429) {
        setQuota({ used: AI_COACH_LIMIT, limit: AI_COACH_LIMIT })
        setError(COACH_EXHAUSTED_MESSAGE)
      } else if (err instanceof ApiError && err.code === 'out_of_credits') {
        setError(COACH_OUT_OF_CREDITS_MESSAGE)
      } else {
        setError(err instanceof ApiError ? err.message : 'The coach could not answer. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  const clear = () => {
    setMessages([])
    setInput('')
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">AI coach</h1>
          <p className="mt-1 text-[13px] text-muted">
            Grounded in your targets, goals, streak, measurements, and last 7 days. General guidance, not medical advice.
          </p>
        </div>
        <Button variant="secondary" onClick={clear} disabled={messages.length === 0 || sending}>
          Clear chat
        </Button>
      </div>

      <AIUsageMeter
        quota={quota}
        configured={configured}
        label="Coach messages"
        note={COACH_QUOTA_NOTE}
        exhaustedMessage={COACH_EXHAUSTED_MESSAGE}
        unavailableMessage={COACH_UNAVAILABLE_MESSAGE}
      />

      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-[12px] text-loss" role="alert">
          {error}
        </div>
      )}

      <Card className="flex min-h-[30rem] flex-col overflow-hidden">
        <div
          className="flex-1 space-y-3 overflow-y-auto p-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col justify-center gap-4 py-6">
              <div className="text-center">
                <p className="text-[14px] font-medium">What would you like help with?</p>
                <p className="mt-1 text-[12px] text-muted">
                  Start with one of these, or type your own question below.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void ask(starter)}
                    disabled={blocked || sending}
                    className="rounded-lg border border-line bg-surface-2 px-3 py-3 text-left text-[12px] text-content transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[13px] text-white'
                    : 'mr-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-content'
                }
              >
                {message.content}
              </div>
            ))
          )}
          {sending && (
            <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-2.5 text-[12px] text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              Reading your recent data...
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void ask(input)
          }}
          className="border-t border-line p-3"
        >
          <label htmlFor="coach-question" className="sr-only">Ask the coach</label>
          <Textarea
            id="coach-question"
            ref={inputRef}
            rows={2}
            value={input}
            maxLength={2000}
            disabled={sending || blocked}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask(input)
              }
            }}
            placeholder="Ask about food, training, sleep, or your progress..."
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">Enter to send · Shift+Enter for a new line</span>
            <Button type="submit" loading={sending} disabled={blocked || input.trim().length === 0}>
              Ask coach
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
