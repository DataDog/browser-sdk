import { vi } from 'vitest'
import { Observable } from '../src/tools/observable'
import type { SessionState } from '../src/domain/session/sessionState'
import type { SessionStoreStrategy } from '../src/domain/session/storeStrategies/sessionStoreStrategy'

export type FakeSessionStoreStrategy = SessionStoreStrategy & {
  setSessionState: ReturnType<typeof vi.fn>
  getInternalState: () => SessionState
  simulateExternalChange: (state: SessionState) => void
}

export function createFakeSessionStoreStrategy({
  initialSession = {},
}: { initialSession?: SessionState } = {}): FakeSessionStoreStrategy {
  let session: SessionState = initialSession
  const sessionObservable = new Observable<SessionState>()

  return {
    setSessionState: vi
      .fn<(fn: (state: SessionState) => SessionState) => Promise<void>>()
      .mockImplementation(async (fn: (state: SessionState) => SessionState): Promise<void> => {
        session = fn({ ...session })
        await Promise.resolve()
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
