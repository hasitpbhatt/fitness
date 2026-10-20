import { useEffect, useState } from 'react'
import { Button } from './ui'
import { applyPwaUpdate, PWA_UPDATE_EVENT } from '../lib/pwa'

export function PwaUpdatePrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onUpdate = () => setVisible(true)
    window.addEventListener(PWA_UPDATE_EVENT, onUpdate)
    return () => window.removeEventListener(PWA_UPDATE_EVENT, onUpdate)
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-[calc(4.5rem_+_env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4 shadow-xl md:bottom-4 md:left-auto md:right-4"
    >
      <div>
        <p className="font-semibold text-content">A new version is ready</p>
        <p className="text-[12px] text-muted">Reload to get the latest fixes and features.</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
          Later
        </Button>
        <Button size="sm" onClick={applyPwaUpdate}>
          Reload
        </Button>
      </div>
    </div>
  )
}
