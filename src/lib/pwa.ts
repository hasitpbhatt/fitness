interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export const PWA_UPDATE_EVENT = 'fitness:update-ready'

let installPrompt: InstallPromptEvent | null = null
let waitingWorker: ServiceWorker | null = null
let reloading = false
const installListeners = new Set<() => void>()

function notifyInstallChange() {
  for (const listener of installListeners) listener()
}

export function initPwa() {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event as InstallPromptEvent
    notifyInstallChange()
  })

  window.addEventListener('appinstalled', () => {
    installPrompt = null
    notifyInstallChange()
  })

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return
    reloading = false
    window.location.reload()
  })

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const announceUpdate = () => {
          if (!registration.waiting || !navigator.serviceWorker.controller) return
          waitingWorker = registration.waiting
          window.dispatchEvent(new Event(PWA_UPDATE_EVENT))
        }

        announceUpdate()

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') announceUpdate()
          })
        })

        const checkForUpdate = () => {
          void registration.update().catch(() => {})
        }

        window.setInterval(checkForUpdate, 60 * 60 * 1000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })
      })
      .catch((error) => {
        console.error('[pwa] service worker registration failed', error)
      })
  })
}

export function canInstall() {
  return installPrompt !== null
}

export function subscribeInstallPrompt(listener: () => void) {
  installListeners.add(listener)
  return () => {
    installListeners.delete(listener)
  }
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = installPrompt
  if (!event) return 'unavailable'

  installPrompt = null
  notifyInstallChange()
  await event.prompt()
  const choice = await event.userChoice
  return choice.outcome
}

export function applyPwaUpdate() {
  if (!waitingWorker) return
  reloading = true
  waitingWorker.postMessage({ type: 'SKIP_WAITING' })
}
