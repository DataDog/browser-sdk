import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import { useSettings } from '../../../hooks/useSettings'
import { clearStoredTokens, isTokenUsable, loadStoredTokens, loginWithOAuth, storeTokens } from './oauth'

const logger = createLogger('useFlagAuth')

export interface FlagAuthState {
  isConnected: boolean
  connecting: boolean
  error: string | null
  site: string
  connect: () => void
  disconnect: () => void
}

/**
 * Tracks the Flags tab's OAuth connection. `isConnected` gates the rest of the tab — nothing else
 * renders until the user has completed OAuth.
 */
export function useFlagAuth(): FlagAuthState {
  const [{ flagsSite }] = useSettings()

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadStoredTokens()
      .then((tokens) => {
        if (!cancelled) {
          // Presence alone isn't a connection: a token counts only if it's still valid or can still
          // be refreshed. An expired, unrefreshable token is dead — getValidAccessToken clears it at
          // fetch time, so here we just avoid showing a "Connected" state it can't back up.
          setConnected(isTokenUsable(tokens))
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
      .then(() => setConnected(true))
      .catch((err: unknown) => {
        logger.error('OAuth login failed:', err)
        setError(err instanceof Error ? err.message : String(err))
        setConnected(false)
      })
      .finally(() => setConnecting(false))
  }, [flagsSite])

  const disconnect = useCallback(() => {
    setError(null)
    // Only drop the connected state once the tokens are actually gone: if removal fails the
    // credentials are still stored and a reopened panel would load them again, so reporting
    // "disconnected" here would make the Disconnect button silently lie.
    clearStoredTokens()
      .then(() => setConnected(false))
      .catch((err: unknown) => {
        logger.error('Error while clearing tokens', err)
        setError('Could not disconnect — please try again.')
      })
  }, [])

  return {
    isConnected: connected,
    connecting,
    error,
    site: flagsSite,
    connect,
    disconnect,
  }
}
