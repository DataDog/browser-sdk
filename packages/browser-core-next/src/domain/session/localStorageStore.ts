import type { SessionState, SessionStore } from '@datadog/core-next'

const SESSION_KEY = '_dd_s'

function createLocalStorageStore(): SessionStore {
  return {
    async get() {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) {
        return undefined
      }
      try {
        return JSON.parse(raw) as SessionState
      } catch {
        return undefined
      }
    },

    async set(state: SessionState) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(state))
    },

    async clear() {
      localStorage.removeItem(SESSION_KEY)
    },

    onExternalChange(callback: () => void) {
      const handler = (event: StorageEvent) => {
        if (event.key === SESSION_KEY) {
          callback()
        }
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}

export { createLocalStorageStore }
