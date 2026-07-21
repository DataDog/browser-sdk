import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import { useSettings } from '../../../hooks/useSettings'
import { clearStoredTokens, loadStoredTokens, loginWithOAuth, storeTokens } from './oauth'

const logger = createLogger('useFlagAuth')

export type FlagAuthMethod = 'oauth' | 'apikey'

export interface FlagAuthState {
  // How the catalog will authenticate: OAuth token, API/App keys (fallback), or not connected yet.
  method: FlagAuthMethod | null
  isConnected: boolean
  connecting: boolean
  error: string | null
  site: string
  hasApiKeys: boolean
  oauthConnected: boolean
  connect: () => void
  disconnect: () => void
}

/**
 * Tracks how the Flags tab is authenticated. OAuth is the primary path; pasted API/App keys are
 * a fallback. `isConnected` gates the rest of the tab — nothing else renders until the user has
 * either completed OAuth or entered API keys.
 */
export function useFlagAuth(): FlagAuthState {
  const [{ flagsApiKey, flagsAppKey, flagsSite }] = useSettings()
  const hasApiKeys = !!flagsApiKey && !!flagsAppKey

  const [oauthConnected, setOauthConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadStoredTokens()
      .then((tokens) => {
        if (!cancelled) {
          setOauthConnected(!!tokens)
        }
      })
      .catch((err: unknown) => logger.error('Error while loading stored tokens', err))
    return () => {
      cancelled = true
    }
  }, [])

  const connect = useCallback(() => {
    setConnecting(true)
    setError(null)
    loginWithOAuth(flagsSite)
      .then((tokens) => storeTokens(tokens))
      .then(() => setOauthConnected(true))
      .catch((err: unknown) => {
        logger.error('OAuth login failed:', err)
        setError(err instanceof Error ? err.message : String(err))
        setOauthConnected(false)
      })
      .finally(() => setConnecting(false))
  }, [flagsSite])

  const disconnect = useCallback(() => {
    setError(null)
    clearStoredTokens()
      .catch((err: unknown) => logger.error('Error while clearing tokens', err))
      .finally(() => setOauthConnected(false))
  }, [])

  const method: FlagAuthMethod | null = oauthConnected ? 'oauth' : hasApiKeys ? 'apikey' : null

  return {
    method,
    isConnected: method !== null,
    connecting,
    error,
    site: flagsSite,
    hasApiKeys,
    oauthConnected,
    connect,
    disconnect,
  }
}
