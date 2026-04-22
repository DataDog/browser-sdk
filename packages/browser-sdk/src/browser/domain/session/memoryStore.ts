import type { SessionState, SessionStore } from '@datadog/core-next'

const SESSION_KEY = '_DD_SESSION'

class MemoryStore implements SessionStore {
  async get(): Promise<SessionState | undefined> {
    return (globalThis as any)[SESSION_KEY] as SessionState | undefined
  }

  async set(state: SessionState): Promise<void> {
    ;(globalThis as any)[SESSION_KEY] = { ...state }
  }

  async clear(): Promise<void> {
    delete (globalThis as any)[SESSION_KEY]
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onExternalChange(_callback?: () => void): () => void {
    // Memory store has no cross-tab sync
    return () => {}
  }
}

export { MemoryStore }
