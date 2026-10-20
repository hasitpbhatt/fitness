import { Navigate, useSearchParams } from 'react-router-dom'
import { Card } from '../components/ui'
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
    <div className="mx-auto max-w-sm py-12">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-[13px] text-muted">
          One click with Google — new here? The same button creates your account. No passwords.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {oauthError && (
            <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">
              Google sign-in failed: {oauthError}. Try again.
            </p>
          )}
          <GoogleButton next={redirectTo} />
        </div>
      </Card>
    </div>
  )
}