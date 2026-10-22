import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui'
import { Alert } from '../components/feedback'
import { Icon } from '../components/icons'
import { GoogleButton } from '../components/GoogleButton'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { user, loading } = useAuth()
  const [searchParams] = useSearchParams()

  const redirectTo = searchParams.get('next') ?? '/dashboard'
  const rawOAuthError = searchParams.get('error')
  let oauthError: string | null = null
  try {
    oauthError = rawOAuthError ? decodeURIComponent(rawOAuthError) : null
  } catch {
    oauthError = 'Unknown error'
  }

  if (!loading && user) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-[56px] max-w-5xl items-center px-4">
          <Link
            to="/"
            className="tap -ml-2 flex items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted hover:text-content"
          >
            <Icon name="chevron-left" size={16} />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
        <Card className="p-6">
          <h1 className="text-lg font-semibold text-content">Sign in</h1>
          <p className="mt-1 text-[13px] text-muted">
            One click with Google — new here? The same button creates your account. No passwords.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            {oauthError && (
              <Alert tone="warning">Google sign-in failed: {oauthError}. Try again.</Alert>
            )}
            <GoogleButton next={redirectTo} />
          </div>
        </Card>
        <p className="mt-4 text-center text-[11px] text-muted">
          We only use your email to identify your account. Nothing else is read.
        </p>
      </main>
    </div>
  )
}
