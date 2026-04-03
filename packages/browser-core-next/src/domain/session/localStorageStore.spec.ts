import type { SessionState } from '@datadog/core-next'
import { createLocalStorageStore } from './localStorageStore'

const SESSION_KEY = '_dd_s'

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session-1',
    deviceId: 'device-1',
    created: 1000,
    lastActivity: 2000,
    ...overrides,
  }
}

describe('createLocalStorageStore', () => {
  afterEach(() => {
    localStorage.removeItem(SESSION_KEY)
  })

  describe('get()', () => {
    it('returns undefined when no session key exists in localStorage', async () => {
      const store = createLocalStorageStore()

      expect(await store.get()).toBeUndefined()
    })

    it('returns the stored state after set()', async () => {
      const store = createLocalStorageStore()
      const state = makeState()

      await store.set(state)

      expect(await store.get()).toEqual(state)
    })

    it('returns undefined when localStorage contains invalid JSON', async () => {
      localStorage.setItem(SESSION_KEY, 'not-valid-json')
      const store = createLocalStorageStore()

      expect(await store.get()).toBeUndefined()
    })
  })

  describe('set()', () => {
    it('writes session state as JSON to localStorage', async () => {
      const store = createLocalStorageStore()
      const state = makeState()

      await store.set(state)

      expect(localStorage.getItem(SESSION_KEY)).toBe(JSON.stringify(state))
    })
  })

  describe('clear()', () => {
    it('removes the session key from localStorage', async () => {
      const store = createLocalStorageStore()

      await store.set(makeState())
      expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()

      await store.clear()

      expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    })

    it('returns undefined from get() after clear()', async () => {
      const store = createLocalStorageStore()

      await store.set(makeState())
      await store.clear()

      expect(await store.get()).toBeUndefined()
    })
  })

  describe('onExternalChange()', () => {
    it('fires callback when the session key changes', () => {
      const store = createLocalStorageStore()
      const callback = jasmine.createSpy('callback')

      const unsubscribe = store.onExternalChange(callback)

      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }))

      expect(callback).toHaveBeenCalledTimes(1)

      unsubscribe()
    })

    it('does not fire callback when a different key changes', () => {
      const store = createLocalStorageStore()
      const callback = jasmine.createSpy('callback')

      const unsubscribe = store.onExternalChange(callback)

      window.dispatchEvent(new StorageEvent('storage', { key: 'some_other_key' }))

      expect(callback).not.toHaveBeenCalled()

      unsubscribe()
    })

    it('returns an unsubscribe function that removes the listener', () => {
      const store = createLocalStorageStore()
      const callback = jasmine.createSpy('callback')

      const unsubscribe = store.onExternalChange(callback)
      unsubscribe()

      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY }))

      expect(callback).not.toHaveBeenCalled()
    })
  })
})
