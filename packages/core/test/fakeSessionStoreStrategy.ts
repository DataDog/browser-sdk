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

    persistSession: jasmine.createSpy('persistSession').and.callFake((newSession) => {
      session = newSession
    }),

    retrieveSession: jasmine.createSpy<() => SessionState>('retrieveSession').and.callFake(() => {
      const plannedSession = plannedRetrieveSessions.shift()
      if (plannedSession) {
        session = plannedSession
      }
      return { ...session }
    }),

    expireSession: jasmine.createSpy('expireSession').and.callFake((previousSession) => {
      session = getExpiredSessionState(previousSession, { trackAnonymousUser: true } as Configuration)
    }),

    planRetrieveSession: (index: number, fakeSession: SessionState) => {
      plannedRetrieveSessions[index] = fakeSession
    },
  }
}
