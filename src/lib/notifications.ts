import { createContext, useContext } from 'react'
import type { AppNotification } from './types'

export type NotificationContextValue = {
  notifications: AppNotification[]
  unread: number
  loading: boolean
  popup: AppNotification | null
  refresh: () => Promise<void>
  view: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
  closePopup: () => void
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined)

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within a NotificationProvider')
  return context
}
