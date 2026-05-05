<<<<<<< HEAD
import { registerCleanupTask } from '../../../../test'
=======
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest'
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
import type { Configuration } from '../../configuration'
import type { SessionState } from '../sessionState'
import { toSessionString } from '../sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './sessionInLocalStorage'
import { LEGACY_SESSION_STORE_KEY, SESSION_STORE_KEY } from './sessionStoreStrategy'

const MOCK_CONFIGURATION = { allowUntrustedEvents: true } as Configuration

describe('LocalStorage SessionStoreStrategy', () => {
  let strategy: ReturnType<typeof initLocalStorageStrategy>

  beforeEach(() => {
<<<<<<< HEAD
    localStorage.removeItem(SESSION_STORE_KEY)
    localStorage.removeItem(LEGACY_SESSION_STORE_KEY)
    strategy = initLocalStorageStrategy(MOCK_CONFIGURATION)
    registerCleanupTask(() => {
      localStorage.removeItem(SESSION_STORE_KEY)
      localStorage.removeItem(LEGACY_SESSION_STORE_KEY)
=======
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('should report local storage as available', () => {
    const available = selectLocalStorageStrategy()
    expect(available).toEqual({ type: SessionPersistence.LOCAL_STORAGE })
  })

  it('should report local storage as not available', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable')
    })
    const available = selectLocalStorageStrategy()
    expect(available).toBeUndefined()
  })

  it('should persist a session in local storage', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    const session = localStorageStrategy.retrieveSession()
    expect(session).toEqual({ ...sessionState })
    expect(getSessionStateFromLocalStorage(SESSION_STORE_KEY)).toEqual(sessionState)
  })

  it('should set `isExpired=1` to the local storage item holding the session', () => {
    const localStorageStrategy = initLocalStorageStrategy(DEFAULT_INIT_CONFIGURATION)
    localStorageStrategy.persistSession(sessionState)
    localStorageStrategy.expireSession(sessionState)
    const session = localStorageStrategy?.retrieveSession()
    expect(session).toEqual({ isExpired: '1' })
    expect(getSessionStateFromLocalStorage(SESSION_STORE_KEY)).toEqual({
      isExpired: '1',
>>>>>>> 9f695e5f5 (✅ Migrate 257 spec files from Jasmine to Vitest API)
    })
  })

  describe('selectLocalStorageStrategy', () => {
    it('should return strategy type when localStorage is available', () => {
      expect(selectLocalStorageStrategy()).toBeDefined()
    })
  })

  describe('setSessionState', () => {
    it('should read current state from localStorage, apply fn, and write back', () => {
      void strategy.setSessionState((state) => ({ ...state, id: 'test-id' }), 'updateState')
      expect(localStorage.getItem(SESSION_STORE_KEY)).toContain('id=test-id')
    })

    it('should start with empty state when nothing stored', () => {
      void strategy.setSessionState((state) => {
        expect(state).toEqual({})
        return { ...state, id: 'new-id' }
      }, 'updateState')
    })

    it('should read existing state from localStorage', () => {
      localStorage.setItem(SESSION_STORE_KEY, toSessionString({ id: 'existing' }))

      void strategy.setSessionState((state) => {
        expect(state.id).toBe('existing')
        return { ...state, expire: '999' }
      }, 'updateState')
    })

    it('should notify sessionObservable after write', async () => {
      const spy = jasmine.createSpy('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      await strategy.setSessionState((state) => ({ ...state, id: 'test-id' }), 'updateState')

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'test-id' }))
    })
  })

  describe('sessionObservable', () => {
    it('should emit on storage event from other tabs', () => {
      const spy = jasmine.createSpy('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      // Simulate storage event (fired by other tabs)
      const event = new StorageEvent('storage', {
        key: SESSION_STORE_KEY,
        newValue: toSessionString({ id: 'from-other-tab' }),
        storageArea: localStorage,
      })
      window.dispatchEvent(event)

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'from-other-tab' }))
    })

    it('should ignore storage events for other keys', () => {
      const spy = jasmine.createSpy('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      const event = new StorageEvent('storage', {
        key: 'other-key',
        newValue: 'value',
        storageArea: localStorage,
      })
      window.dispatchEvent(event)

      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('migration from legacy localStorage key', () => {
    it('should read from legacy key on first call when new key is empty', async () => {
      localStorage.setItem(LEGACY_SESSION_STORE_KEY, 'id=legacy-id&created=123')

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState!.id).toBe('legacy-id')
      expect(capturedState!.created).toBe('123')
    })

    it('should not read from legacy key when new key has data', async () => {
      localStorage.setItem(SESSION_STORE_KEY, toSessionString({ id: 'new-id' }))
      localStorage.setItem(LEGACY_SESSION_STORE_KEY, 'id=legacy-id')

      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState!.id).toBe('new-id')
    })

    it('should not read from legacy key on subsequent calls', async () => {
      localStorage.setItem(LEGACY_SESSION_STORE_KEY, 'id=legacy-id')

      // First call triggers migration
      await strategy.setSessionState((state) => state, 'updateState')

      // Clear the new key to simulate empty state
      localStorage.removeItem(SESSION_STORE_KEY)

      // Second call should not read from legacy key
      let capturedState: SessionState | undefined
      await strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      expect(capturedState).toEqual({})
    })
  })
})
