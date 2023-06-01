import type { CookieOptions } from '../../browser/cookie'
import { isEmptyObject } from '../../tools/utils/objectUtils'

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
