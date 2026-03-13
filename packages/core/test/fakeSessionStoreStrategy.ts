import { Observable } from '../src/tools/observable'
import type { SessionState } from '../src/domain/session/sessionState'
import type { SessionStoreStrategy } from '../src/domain/session/storeStrategies/sessionStoreStrategy'

export type FakeSessionStoreStrategy = SessionStoreStrategy & {
  setSessionState: jasmine.Spy<(fn: (state: SessionState) => SessionState) => void>
  getInternalState: () => SessionState
  simulateExternalChange: (state: SessionState) => void
}

export function createFakeSessionStoreStrategy({
  initialSession = {},
}: { initialSession?: SessionState } = {}): FakeSessionStoreStrategy {
  let session: SessionState = initialSession
  const sessionObservable = new Observable<SessionState>()

  return {
    setSessionState: jasmine.createSpy('setSessionState').and.callFake((fn: (state: SessionState) => SessionState) => {
      session = fn({ ...session })
      sessionObservable.notify({ ...session })
    }),
    sessionObservable,

    // Test helpers
    getInternalState: () => ({ ...session }),
    simulateExternalChange: (state: SessionState) => {
      session = state
      sessionObservable.notify({ ...session })
    },
  }
}
