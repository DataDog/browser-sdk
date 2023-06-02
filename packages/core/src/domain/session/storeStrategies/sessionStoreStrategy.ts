import type { SessionState } from '../sessionState'

export interface SessionStoreStrategy {
  persistSession: (session: SessionState) => void
  retrieveSession: () => SessionState
  clearSession: () => void
}
