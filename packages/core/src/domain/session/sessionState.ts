import { isEmptyObject } from '../../tools/utils/objectUtils'
import { objectEntries } from '../../tools/utils/polyfills'
import { dateNow } from '../../tools/utils/timeUtils'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'

const SESSION_ENTRY_REGEXP = /^([a-zA-Z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const EXPIRED = '1'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  isExpired?: typeof EXPIRED

  [key: string]: string | undefined
}

export function getExpiredSessionState(): SessionState {
  return {
    isExpired: EXPIRED,
  }
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
  return objectEntries(session)
    .map(([key, value]) => `${key}=${value}`)
    .join(SESSION_ENTRY_SEPARATOR)
}

export function toSessionState(sessionString: string | undefined | null) {
  const session: SessionState = {}
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry)
      if (matches !== null) {
        const [, key, value] = matches
        session[key] = value
      }
    })
  }
  return session
}

function isValidSessionString(sessionString: string | undefined | null): sessionString is string {
  return (
    !!sessionString &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}
