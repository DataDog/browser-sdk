import { vi } from 'vitest'
import { Observable } from '../src/tools/observable'
import type { SessionState } from '../src/domain/session/sessionState'
import type { SessionStoreStrategy } from '../src/domain/session/storeStrategies/sessionStoreStrategy'

export type FakeSessionStoreStrategy = SessionStoreStrategy & {
<<<<<<< HEAD
  setSessionState: ReturnType<typeof vi.fn>
=======
  setSessionState: ReturnType<typeof vi.fn<(fn: (state: SessionState) => SessionState) => Promise<void>>>
>>>>>>> 8fed0c958 (🔀 Merge main (resolve 77 conflicts, migrate new code to Vitest))
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
