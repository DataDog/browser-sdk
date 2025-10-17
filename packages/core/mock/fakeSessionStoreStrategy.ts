import { vi } from 'vitest'
import type { Configuration } from '../src/domain/configuration'
import type { SessionState } from '../src/domain/session/sessionState'
import { getExpiredSessionState } from '../src/domain/session/sessionState'

export function createFakeSessionStoreStrategy({
  isLockEnabled = false,
  initialSession = {},
}: { isLockEnabled?: boolean; initialSession?: SessionState } = {}) {
  let session: SessionState = initialSession
  const plannedRetrieveSessions: SessionState[] = []

  return {
    isLockEnabled,

    persistSession: vi.fn((newSession) => {
      session = newSession
    }),

    retrieveSession: vi.fn<() => SessionState>(() => {
      const plannedSession = plannedRetrieveSessions.shift()
      if (plannedSession) {
        session = plannedSession
      }
      return { ...session }
    }),

    expireSession: vi.fn((previousSession) => {
      session = getExpiredSessionState(previousSession, { trackAnonymousUser: true } as Configuration)
    }),

    planRetrieveSession: (index: number, fakeSession: SessionState) => {
      plannedRetrieveSessions[index] = fakeSession
    },
  }
}
