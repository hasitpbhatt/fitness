import { useCallback, useEffect, useState, type ReactNode, createContext, useContext } from 'react'
import { api } from './api'
import type { User } from './types'

export interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoadingState] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: User | null }>('/me')
      setUserState(data.user)
    } catch {
      setUserState(null)
    } finally {
      setLoadingState(false)
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- session hydration on mount, synchronizing with an external system
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUserState(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}