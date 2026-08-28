import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import type { FlagIdentity } from './flagIdentity'
import { fetchFlagIdentity } from './flagIdentity'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useFlagIdentity')

const NO_IDENTITY: FlagIdentity = { userId: null, teamHandles: [], teamsForbidden: false, teamsUnavailable: false }

export interface FlagIdentityState extends FlagIdentity {
  loading: boolean
}

/**
 * Loads the signed-in user's id + team handles for the "My feature flags"/"My teams" filters. Runs
 * independently of the catalog, so the catalog loads fine even when identity is still pending or fails.
 *
 * Failures are deliberately silent — identity only powers two optional filters, so a failed lookup
 * just leaves them disabled. It also doesn't disconnect on a bad token (the catalog fetch owns that,
 * to avoid a double disconnect).
 */
export function useFlagIdentity(auth: FlagAuthState): FlagIdentityState {
  const { isConnected, site } = auth

  const [identity, setIdentity] = useState<FlagIdentity>(NO_IDENTITY)
  // Start `true` when connected so the first render (before the fetch effect runs) reads as "loading"
  // rather than "resolved but empty" — otherwise the My-flags toggle briefly shows the unavailable state.
  const [loading, setLoading] = useState(isConnected)

  useEffect(() => {
    if (!isConnected) {
      setIdentity(NO_IDENTITY)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async (): Promise<FlagIdentity> => {
      const token = await getValidAccessToken(site)
      return token ? fetchFlagIdentity(token, site) : NO_IDENTITY
    }

    load()
      .then((loaded) => {
        if (!cancelled) {
          setIdentity(loaded)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Error while fetching flag identity:', err)
          setIdentity(NO_IDENTITY)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isConnected, site])

  return { ...identity, loading }
}
