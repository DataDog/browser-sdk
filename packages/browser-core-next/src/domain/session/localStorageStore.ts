import type { SessionState, SessionStore } from '@datadog/core-next'

const SESSION_KEY = '_dd_s'

class LocalStorageStore implements SessionStore {
  async get(): Promise<SessionState | undefined> {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return undefined
    }
    try {
      return JSON.parse(raw) as SessionState
    } catch {
      return undefined
    }
  }

  async set(state: SessionState): Promise<void> {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state))
  }

  async clear(): Promise<void> {
    localStorage.removeItem(SESSION_KEY)
  }

  onExternalChange(callback: () => void): () => void {
    const handler = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) {
        callback()
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }
}

export { LocalStorageStore }
