import type { CookieOptions } from '../../browser/cookie'
import { isEmptyObject } from '../../tools/utils/objectUtils'
import { objectEntries } from '../../tools/utils/polyfills'

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/
const SESSION_ENTRY_SEPARATOR = '&'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string

  [key: string]: string | undefined
}

export type StoreInitOptions = CookieOptions

export interface SessionStore {
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

export function isSessionInExpiredState(session: SessionState) {
  return isEmptyObject(session)
}

export function toSessionString(session: SessionState) {
  return objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
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
