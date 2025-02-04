import { isEmptyObject } from '../../tools/utils/objectUtils'
import { objectEntries } from '../../tools/utils/polyfills'
import { dateNow } from '../../tools/utils/timeUtils'
import { generateAnonymousId } from '../user'
import type { Configuration } from '../configuration'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { isValidSessionString, SESSION_ENTRY_REGEXP, SESSION_ENTRY_SEPARATOR } from './sessionStateValidation'
export const EXPIRED = '1'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  isExpired?: typeof EXPIRED

  [key: string]: string | undefined
}

export function getExpiredSessionState(
  previousSessionState: SessionState | undefined,
  configuration: Configuration
): SessionState {
  const expiredSessionState: SessionState = {
    isExpired: EXPIRED,
  }
  if (configuration.trackAnonymousUser) {
    if (previousSessionState?.anonymousId) {
      expiredSessionState.anonymousId = previousSessionState?.anonymousId
    } else {
      expiredSessionState.anonymousId = generateAnonymousId()
    }
  }
  return expiredSessionState
}

export function isSessionInNotStartedState(session: SessionState) {
  return isEmptyObject(session)
}

export function isSessionStarted(session: SessionState) {
  return !isSessionInNotStartedState(session)
}

export function isSessionInExpiredState(session: SessionState) {
  return session.isExpired !== undefined || !isActiveSession(session)
}

// An active session is a session in either `Tracked` or `NotTracked` state
function isActiveSession(sessionState: SessionState) {
  // created and expire can be undefined for versions which was not storing them
  // these checks could be removed when older versions will not be available/live anymore
  return (
    (sessionState.created === undefined || dateNow() - Number(sessionState.created) < SESSION_TIME_OUT_DELAY) &&
    (sessionState.expire === undefined || dateNow() < Number(sessionState.expire))
  )
}

export function expandSessionState(session: SessionState) {
  session.expire = String(dateNow() + SESSION_EXPIRATION_DELAY)
}

export function toSessionString(session: SessionState) {
  return (
    objectEntries(session)
      // we use `aid` as a key for anonymousId
      .map(([key, value]) => (key === 'anonymousId' ? `aid=${value}` : `${key}=${value}`))
      .join(SESSION_ENTRY_SEPARATOR)
  )
}

export function toSessionState(sessionString: string | undefined | null) {
  const session: SessionState = {}
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry)
      if (matches !== null) {
        const [, key, value] = matches
        if (key === 'aid') {
          // we use `aid` as a key for anonymousId
          session.anonymousId = value
        } else {
          session[key] = value
        }
      }
    })
  }
  return session
}
