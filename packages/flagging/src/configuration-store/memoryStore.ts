import type { ISyncStore } from './configurationStore'

export function createMemoryStore<T>(): ISyncStore<T> {
  let store: Record<string, T> = {}
  let initialized = false

  return {
    get(key: string): T | null {
      return store[key] ?? null
    },

    entries(): Record<string, T> {
      return store
    },

    getKeys(): string[] {
      return Object.keys(store)
    },

    isInitialized(): boolean {
      return initialized
    },

    setEntries(entries: Record<string, T>): void {
      store = { ...entries }
      initialized = true
    },
  }
}
