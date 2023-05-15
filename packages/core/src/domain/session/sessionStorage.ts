import type { CookieOptions } from '../../browser/cookie'
import { isEmptyObject } from '../../tools/utils/objectUtils'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string

  [key: string]: string | undefined
}

interface StorageAccessOptionsWithLock {
  pollDelay: number
  lockEnabled: true
  lockRetryDelay: number
  lockMaxTries: number
}

interface StorageAccessOptionsWithoutLock {
  pollDelay: number
  lockEnabled: false
}

type StorageAccessOptions = StorageAccessOptionsWithLock | StorageAccessOptionsWithoutLock

export type StorageInitOptions = CookieOptions

export interface SessionStorage {
  storageAccessOptions: StorageAccessOptions
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

export function isSessionInExpiredState(session: SessionState) {
  return isEmptyObject(session)
}
