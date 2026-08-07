import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import type { FlagIdentity } from './flagIdentity'
import { fetchFlagIdentity } from './flagIdentity'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useFlagIdentity')

const NO_IDENTITY: FlagIdentity = { userId: null, teamHandles: [], teamsForbidden: false }

export interface FlagIdentityState extends FlagIdentity {
  loading: boolean
}

/**
 * Loads the signed-in user's UUID and team handles, which the "My feature flags" and "My teams"
 * filters need (see flagIdentity.ts). Refetches whenever the connection state or site changes.
 *
 * Failures are deliberately silent: identity only enables two optional filters, so a failed lookup
 * leaves them disabled rather than surfacing an error over a catalog that works fine without them.
 * Unlike useFlagCatalog this does not disconnect on an unusable token — the catalog fetch runs
 * alongside and owns that decision, and having both react to it would risk a double disconnect.
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
