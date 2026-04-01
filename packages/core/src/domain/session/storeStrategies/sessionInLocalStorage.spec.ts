import { registerCleanupTask } from '../../../../test'
import type { Configuration } from '../../configuration'
import type { SessionState } from '../sessionState'
import { toSessionString } from '../sessionState'
import { initLocalStorageStrategy, selectLocalStorageStrategy } from './sessionInLocalStorage'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const MOCK_CONFIGURATION = { allowUntrustedEvents: true } as Configuration

describe('LocalStorage SessionStoreStrategy', () => {
  let strategy: ReturnType<typeof initLocalStorageStrategy>

  beforeEach(() => {
    localStorage.removeItem(SESSION_STORE_KEY)
    strategy = initLocalStorageStrategy(MOCK_CONFIGURATION)
    registerCleanupTask(() => {
      localStorage.removeItem(SESSION_STORE_KEY)
    })
  })

  describe('selectLocalStorageStrategy', () => {
    it('should return strategy type when localStorage is available', () => {
      expect(selectLocalStorageStrategy()).toBeDefined()
    })
  })

  describe('setSessionState', () => {
    it('should read current state from localStorage, apply fn, and write back', () => {
      void strategy.setSessionState((state) => ({ ...state, id: 'test-id' }))
      expect(localStorage.getItem(SESSION_STORE_KEY)).toContain('id=test-id')
    })

    it('should start with empty state when nothing stored', () => {
      void strategy.setSessionState((state) => {
        expect(state).toEqual({})
        return { ...state, id: 'new-id' }
      })
    })

    it('should read existing state from localStorage', () => {
      localStorage.setItem(SESSION_STORE_KEY, toSessionString({ id: 'existing' } as SessionState))

      void strategy.setSessionState((state) => {
        expect(state.id).toBe('existing')
        return { ...state, expire: '999' }
      })
    })

    it('should notify sessionObservable after write', async () => {
      const spy = jasmine.createSpy('observer')
      const subscription = strategy.sessionObservable.subscribe(spy)
      registerCleanupTask(() => subscription.unsubscribe())

      await strategy.setSessionState((state) => ({ ...state, id: 'test-id' }))

      expect(spy).toHaveBeenCalledOnceWith({
        cookieValue: undefined,
        sessionState: jasmine.objectContaining({ id: 'test-id' }),
      })
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
        newValue: toSessionString({ id: 'from-other-tab' } as SessionState),
        storageArea: localStorage,
      })
      window.dispatchEvent(event)

      expect(spy).toHaveBeenCalledOnceWith({
        cookieValue: undefined,
        sessionState: jasmine.objectContaining({ id: 'from-other-tab' }),
      })
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
})
