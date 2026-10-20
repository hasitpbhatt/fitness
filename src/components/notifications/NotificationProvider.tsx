import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { NotificationContext } from '../../lib/notifications'
import type { AppNotification } from '../../lib/types'

const POPUP_SESSION_KEY = 'fitness_notification_popup'

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [popup, setPopup] = useState<AppNotification | null>(null)
  const popupShown = useRef(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([])
      setPopup(null)
      return
    }
    setLoading(true)
    try {
      const result = await api.get<{ notifications: AppNotification[] }>('/fitness/notifications')
      setNotifications(result.notifications)
    } catch {
      // The feed is optional; never block the app on it.
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- refresh the feed after auth/navigation
    void refresh()
  }, [refresh, location.pathname])

  useEffect(() => {
    if (!user) return
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh, user])

  useEffect(() => {
    popupShown.current = false
    // oxlint-disable-next-line react/set-state-in-effect -- clear the feed when the user changes
    setNotifications([])
    // oxlint-disable-next-line react/set-state-in-effect -- clear the popup when the user changes
    setPopup(null)
  }, [user?.id])

  const view = useCallback(async (id: string) => {
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, viewed: 1 } : item)),
    )
    await api.post(`/fitness/notifications/${id}/view`).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user || popupShown.current) return
    const candidate = notifications.find((item) => item.sticky === 0 && item.viewed === 0)
    if (!candidate) return
    popupShown.current = true
    try {
      if (window.sessionStorage.getItem(POPUP_SESSION_KEY) === candidate.id) return
      window.sessionStorage.setItem(POPUP_SESSION_KEY, candidate.id)
    } catch {
      // Storage can be blocked; showing it once this render is still fine.
    }
    // oxlint-disable-next-line react/set-state-in-effect -- show one new server notification
    setPopup(candidate)
    void view(candidate.id)
  }, [notifications, user, view])

  const dismiss = useCallback(async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
    setPopup((current) => (current?.id === id ? null : current))
    await api.post(`/fitness/notifications/${id}/dismiss`).catch(() => {})
  }, [])

  const closePopup = useCallback(() => setPopup(null), [])

  const unread = useMemo(
    () => notifications.filter((item) => item.viewed === 0).length,
    [notifications],
  )

  const value = useMemo(
    () => ({ notifications, unread, loading, popup, refresh, view, dismiss, closePopup }),
    [notifications, unread, loading, popup, refresh, view, dismiss, closePopup],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
