import { isEmptyObject } from '../../tools/utils/objectUtils'

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  lock?: string

  [key: string]: string | undefined
}

export interface SessionStorage {
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}

export function isSessionInExpiredState(session: SessionState) {
  return isEmptyObject(session)
}
