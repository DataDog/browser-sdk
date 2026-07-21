import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import { useSettings } from '../../../hooks/useSettings'
import type { CatalogFlag } from './flagCatalog'
import { fetchFlagCatalog, fetchFlagCatalogWithToken } from './flagCatalog'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useFlagCatalog')

export interface FlagCatalogState {
  flags: CatalogFlag[]
  loading: boolean
  error: string | null
}

/**
 * Loads the flag catalog using whichever auth method is active: an OAuth token (primary) or the
 * stored API/App keys (fallback). Refetches whenever the auth method or credentials change.
 * Catalog failures are surfaced as a non-blocking error — the override read/write workflow works
 * without any catalog.
 */
export function useFlagCatalog(auth: FlagAuthState): FlagCatalogState {
  const [{ flagsApiKey, flagsAppKey, flagsSite }] = useSettings()
  const { method } = auth

  const [flags, setFlags] = useState<CatalogFlag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!method) {
      setFlags([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async (): Promise<CatalogFlag[]> => {
      if (method === 'oauth') {
        const token = await getValidAccessToken(flagsSite)
        if (!token) {
          throw new Error('Not authenticated — please reconnect to Datadog')
        }
        return fetchFlagCatalogWithToken(token, flagsSite)
      }
      return fetchFlagCatalog({ apiKey: flagsApiKey, appKey: flagsAppKey, site: flagsSite })
    }

    load()
      .then((catalog) => {
        if (!cancelled) {
          setFlags(catalog)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Error while fetching flag catalog:', err)
          setFlags([])
          setError(err instanceof Error ? err.message : String(err))
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
  }, [method, flagsApiKey, flagsAppKey, flagsSite])

  return { flags, loading, error }
}
