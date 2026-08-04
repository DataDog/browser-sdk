import { useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import type { CatalogFlag, FlagCatalogRequest } from './flagCatalog'
import { fetchFlagCatalog } from './flagCatalog'
import { getValidAccessToken } from './oauth'
import type { FlagAuthState } from './useFlagAuth'

const logger = createLogger('useFlagCatalog')

export interface FlagCatalogState {
  flags: CatalogFlag[]
  // Total number of flags matching the current filters, across all pages (server-reported).
  total: number
  loading: boolean
  error: string | null
}

/**
 * Loads one page of the flag catalog for the given request, letting the server do the filtering and
 * pagination. Refetches whenever the connection, site, or request (page/search/filters) changes.
 * Catalog failures are surfaced as a non-blocking error — the override read/write workflow works
 * without any catalog.
 */
export function useFlagCatalog(auth: FlagAuthState, request: FlagCatalogRequest): FlagCatalogState {
  const { isConnected, site, disconnect } = auth

  const [flags, setFlags] = useState<CatalogFlag[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isConnected) {
      setFlags([])
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      const token = await getValidAccessToken(site)
      if (!token) {
        // The stored session expired and couldn't be refreshed (getValidAccessToken cleared it).
        // Flip back to the disconnected state so the tab shows the sign-in screen again, instead of
        // staying "Connected" with a permanent catalog error and no obvious way to re-auth.
        disconnect()
        return { flags: [], total: 0 }
      }
      return fetchFlagCatalog(token, site, request)
    }

    load()
      .then((page) => {
        if (!cancelled) {
          setFlags(page.flags)
          setTotal(page.total)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          logger.error('Error while fetching flag catalog:', err)
          setFlags([])
          setTotal(0)
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
  }, [isConnected, site, disconnect, request])

  return { flags, total, loading, error }
}
