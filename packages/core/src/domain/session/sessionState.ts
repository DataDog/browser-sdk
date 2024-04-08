import { objectEntries } from '../../tools/utils/polyfills'
import { dateNow } from '../../tools/utils/timeUtils'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export const enum SessionExpiredReason {
  UNKNOWN = '0',
}

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string
  expired?: SessionExpiredReason

  [key: string]: string | undefined
}

export function getInitialSessionState(): SessionState {
  return {
    expired: SessionExpiredReason.UNKNOWN,
  }
}

export function isSessionInitialized(session: SessionState) {
  return session.id !== undefined || session.expired !== undefined
}

export function isSessionInExpiredState(session: SessionState) {
  // // an expired session is `{expired = '0'}` or `{expired = '0', lock = whatever}`
  return (
    (Object.keys(session).length === 1 && session.expired !== undefined) ||
    (Object.keys(session).length === 2 && session.expired !== undefined && session.lock !== undefined)
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
