import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import type { CatalogFlag } from './flagsRequests'
import { fetchFlagsByKeys } from './flagsRequests'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useOverriddenFlags')

export interface OverriddenFlagsState {
  flags: CatalogFlag[]
  /** Keys a well-formed lookup proved absent. Empty while loading and after a failure. */
  missingKeys: ReadonlySet<string>
}

const EMPTY: OverriddenFlagsState = { flags: [], missingKeys: new Set() }

/**
 * Loads the catalog data (name, variants, type) for the currently-overridden flag keys, so the
 * "Local overrides" section can render them even when they're not on the current catalog page. A key
 * that doesn't resolve falls back to a minimal row so the override can still be reverted, and lands
 * in `missingKeys`, which the row notes as archived or deleted. Failures are non-blocking: the
 * section shows fallback rows, unmarked.
 */
export function useOverriddenFlags(auth: FlagAuthState, keys: string[]): OverriddenFlagsState {
  const { isConnected, site } = auth
  const [state, setState] = useState<OverriddenFlagsState>(EMPTY)

  // Sort + join so the effect only reruns when the *set* of keys changes, not on every render (the
  // caller passes a fresh array each time).
  const keyList = [...keys].sort().join('\n')

  useEffect(() => {
    const keyArray = keyList ? keyList.split('\n') : []
    if (!isConnected || keyArray.length === 0) {
      setState(EMPTY)
      return
    }

    let cancelled = false
    // Drop the previous verdict while the new lookup runs; keep the flags so rows don't blank out.
    setState((previous) => ({ flags: previous.flags, missingKeys: new Set() }))
    getValidAccessToken(site)
      .then((token) => (token ? fetchFlagsByKeys(token, site, keyArray) : { flags: [], missingKeys: [] }))
      .then(({ flags, missingKeys }) => {
        if (!cancelled) {
          setState({ flags, missingKeys: new Set(missingKeys) })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Error while fetching overridden flags:', err)
          setState(EMPTY)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isConnected, site, keyList])

  return state
}
