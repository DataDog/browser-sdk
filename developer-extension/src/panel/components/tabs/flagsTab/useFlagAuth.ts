import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '../../../../common/logger'
import { toErrorMessage } from '../../../../common/toErrorMessage'
import { useSettings } from '../../../hooks/useSettings'
import { isTokenUsable, loadStoredTokens, loginWithOAuth, revokeAndClearTokens, storeTokens } from './oauth'

const logger = createLogger('useFlagAuth')

export interface FlagAuthState {
  isConnected: boolean
  connecting: boolean
  disconnecting: boolean
  error: string | null
  /** Set when disconnecting locally succeeded but revoking the grant at Datadog did not. */
  warning: string | null
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
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

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
    setWarning(null)
    loginWithOAuth(flagsSite)
      .then((tokens) => storeTokens(tokens))
      .then(() => setConnected(true))
      .catch((err: unknown) => {
        logger.error('OAuth login failed:', err)
        setError(toErrorMessage(err))
        setConnected(false)
      })
      .finally(() => setConnecting(false))
  }, [flagsSite])

  const disconnect = useCallback(() => {
    setError(null)
    setWarning(null)
    setDisconnecting(true)
    // Only drop the connected state once the tokens are actually gone: if removal fails the
    // credentials are still stored and a reopened panel would load them again, so reporting
    // "disconnected" here would make the Disconnect button silently lie.
    revokeAndClearTokens(flagsSite)
      .then(({ revoked }) => {
        setConnected(false)
        if (!revoked) {
          // The local session is gone, so the tab is genuinely disconnected — but the grant may
          // still be live at Datadog, which only the user can clear (Organization Settings →
          // Authorized Applications). Say so instead of implying a clean revocation.
          setWarning('Signed out locally, but the Datadog authorization could not be revoked.')
        }
      })
      .catch((err: unknown) => {
        logger.error('Error while clearing tokens', err)
        setError('Could not disconnect — please try again.')
      })
      .finally(() => setDisconnecting(false))
  }, [flagsSite])

  return {
    isConnected: connected,
    connecting,
    disconnecting,
    error,
    warning,
    site: flagsSite,
    connect,
    disconnect,
  }
}
