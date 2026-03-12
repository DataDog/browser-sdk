import { Observable } from '../src/tools/observable'
import type { SessionState } from '../src/domain/session/sessionState'
import type { SessionStoreStrategy } from '../src/domain/session/storeStrategies/sessionStoreStrategy'

export function createFakeSessionStoreStrategy({
  initialSession = {},
}: { initialSession?: SessionState } = {}): SessionStoreStrategy & {
  getInternalState: () => SessionState
  simulateExternalChange: (state: SessionState) => void
} {
  let session: SessionState = initialSession
  const sessionObservable = new Observable<SessionState>()

  return {
    setSessionState: jasmine.createSpy('setSessionState').and.callFake(
      (fn: (state: SessionState) => SessionState) => {
        session = fn({ ...session })
        sessionObservable.notify({ ...session })
      }
    ),
    sessionObservable,

    // Test helpers
    getInternalState: () => ({ ...session }),
    simulateExternalChange: (state: SessionState) => {
      session = state
      sessionObservable.notify({ ...session })
    },
  }
}
