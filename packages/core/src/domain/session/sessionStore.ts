import type { CookieOptions } from '../../browser/cookie'
import { isEmptyObject } from '../../tools/utils/objectUtils'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string

  [key: string]: string | undefined
}

type StoreAccessOptionsWithLock = {
  pollDelay: number
  lockEnabled: true
  lockRetryDelay: number
  lockMaxTries: number
}

type StoreAccessOptionsWithoutLock = {
  pollDelay: number
  lockEnabled: false
}

export type StoreInitOptions = CookieOptions

export interface SessionStore {
  storeAccessOptions: StoreAccessOptionsWithLock | StoreAccessOptionsWithoutLock
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

export function isSessionInExpiredState(session: SessionState) {
  return isEmptyObject(session)
}
