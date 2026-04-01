import { Observable } from '../src/tools/observable'
import type { SessionState } from '../src/domain/session/sessionState'
import type {
  SessionStoreStrategy,
  SessionObservableEvent,
} from '../src/domain/session/storeStrategies/sessionStoreStrategy'

export type FakeSessionStoreStrategy = SessionStoreStrategy & {
  setSessionState: jasmine.Spy<(fn: (state: SessionState) => SessionState) => Promise<void>>
  getInternalState: () => SessionState
  simulateExternalChange: (state: SessionState) => void
}

export function createFakeSessionStoreStrategy({
  initialSession = {},
}: { initialSession?: SessionState } = {}): FakeSessionStoreStrategy {
  let session: SessionState = initialSession
  const sessionObservable = new Observable<SessionObservableEvent>()

  return {
    setSessionState: jasmine
      .createSpy('setSessionState')
      .and.callFake(async (fn: (state: SessionState) => SessionState): Promise<void> => {
        session = fn({ ...session })
        await Promise.resolve()
        sessionObservable.notify({ cookieValue: undefined, sessionState: { ...session } })
      }),
    sessionObservable,

    // Test helpers
    getInternalState: () => ({ ...session }),
    simulateExternalChange: (state: SessionState) => {
      session = state
      sessionObservable.notify({ cookieValue: undefined, sessionState: { ...session } })
    },
  }
}
