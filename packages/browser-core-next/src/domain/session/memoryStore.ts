import type { SessionState, SessionStore } from '@datadog/core-next'

const SESSION_KEY = '_DD_SESSION'

function createMemoryStore(): SessionStore {
  return {
    async get() {
      return (globalThis as any)[SESSION_KEY] as SessionState | undefined
    },

    async set(state: SessionState) {
      ;(globalThis as any)[SESSION_KEY] = { ...state }
    },

    async clear() {
      delete (globalThis as any)[SESSION_KEY]
    },

    onExternalChange() {
      // Memory store has no cross-tab sync
      return () => {}
    },
  }
}

export { createMemoryStore }
