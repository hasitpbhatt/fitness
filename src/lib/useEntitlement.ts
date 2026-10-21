import { useEffect, useState } from 'react'
import { api } from './api'
import type { FitnessEntitlement } from './types'

/** Member access tier; null means the lookup has not succeeded yet. */
export function useEntitlement(userId: string | null | undefined): FitnessEntitlement | null {
  const [entitlement, setEntitlement] = useState<FitnessEntitlement | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    api
      .get<{ entitlement: FitnessEntitlement }>('/fitness/entitlement')
      .then((result) => {
        if (active) setEntitlement(result.entitlement)
      })
      .catch(() => {
        // The server remains authoritative; a failed lookup never grants access.
      })
    return () => {
      active = false
    }
  }, [userId])

  return entitlement
}
