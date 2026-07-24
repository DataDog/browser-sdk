import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import type { CatalogFlag } from './flagsRequests'
import { fetchFlagsByKeys } from './flagsRequests'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useOverriddenFlags')

/**
 * Loads the catalog data (name, variants, type) for the currently-overridden flag keys, so the
 * "Local overrides" section can render them even when they're not on the current catalog page. Keys
 * that don't resolve to a flag are simply absent — the caller falls back to a minimal row so every
 * override can still be reverted. Failures are non-blocking (the section just shows fallback rows).
 */
export function useOverriddenFlags(auth: FlagAuthState, keys: string[]): CatalogFlag[] {
  const { isConnected, site } = auth
  const [flags, setFlags] = useState<CatalogFlag[]>([])

  // Sort + join so the effect only reruns when the *set* of keys changes, not on every render (the
  // caller passes a fresh array each time).
  const keyList = [...keys].sort().join('\n')

  useEffect(() => {
    const keyArray = keyList ? keyList.split('\n') : []
    if (!isConnected || keyArray.length === 0) {
      setFlags([])
      return
    }

    let cancelled = false
    getValidAccessToken(site)
      .then((token) => (token ? fetchFlagsByKeys(token, site, keyArray) : []))
      .then((loaded) => {
        if (!cancelled) {
          setFlags(loaded)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Error while fetching overridden flags:', err)
          setFlags([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isConnected, site, keyList])

  return flags
}
