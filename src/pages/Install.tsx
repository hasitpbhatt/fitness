import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { canInstall, promptInstall, subscribeInstallPrompt } from '../lib/pwa'

function isStandalone() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  )
}

function platformHint() {
  const userAgent = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(userAgent)) {
    return 'On iPhone or iPad: tap Share, then Add to Home Screen.'
  }
  if (/Android/.test(userAgent)) {
    return 'On Android: open the browser menu, then choose Install app or Add to Home screen.'
  }
  return 'On desktop: use the install icon in your browser address bar.'
}

export default function Install() {
  const [available, setAvailable] = useState(canInstall)
  const [installed, setInstalled] = useState(isStandalone)
  const [message, setMessage] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => subscribeInstallPrompt(() => setAvailable(canInstall())), [])

  useEffect(() => {
    const onInstalled = () => {
      setInstalled(true)
      setMessage('Installed. Open fitness from your home screen.')
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  async function handleInstall() {
    setInstalling(true)
    setMessage(null)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') {
        setInstalled(true)
        setMessage('Installed. Open fitness from your home screen.')
      } else if (outcome === 'dismissed') {
        setMessage('Install cancelled. You can try again from your browser menu.')
      }
    } finally {
      setInstalling(false)
    }
  }

  return (
    <main className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="inline-flex items-center gap-2 font-semibold text-content">
          <img src="/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
          fitness.hasit.in
        </Link>

        <Card className="mt-8 overflow-hidden">
          <div className="hero-glow border-b border-line p-6">
            <div className="flex items-start gap-4">
              <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-content">Install fitness</h1>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Keep your streak one tap away. The app opens full screen and the shell works
                  without a connection.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {installed ? (
              <div className="rounded-lg border border-gain/40 bg-gain/10 p-4 text-[13px] text-content">
                fitness is installed on this device.
              </div>
            ) : (
              <>
                <Button
                  onClick={() => void handleInstall()}
                  loading={installing}
                  disabled={!available}
                  className="w-full"
                >
                  Install app
                </Button>
                {!available && (
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">{platformHint()}</p>
                )}
              </>
            )}

            {message && (
              <p role="status" className="mt-3 text-[12px] leading-relaxed text-muted">
                {message}
              </p>
            )}
          </div>
        </Card>

        <Card className="mt-4 p-6">
          <h2 className="font-semibold text-content">What you get</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            <li>Full-screen app window with no browser chrome.</li>
            <li>The app shell loads offline; your data syncs when you are back online.</li>
            <li>Updates are offered in-app, so you are never stuck on an old build.</li>
          </ul>
        </Card>

        <p className="mt-6 text-center text-[13px] text-muted">
          <Link to="/dashboard" className="text-accent hover:text-accent-hover">
            Continue in browser
          </Link>
        </p>
      </div>
    </main>
  )
}
