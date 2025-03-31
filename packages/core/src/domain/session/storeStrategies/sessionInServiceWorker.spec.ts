import { selectNewStrategy, initNewStrategy } from './sessionInServiceWorker'
import { SESSION_STORE_KEY, SessionStoreStrategy } from './sessionStoreStrategy'
import { SessionState, toSessionString } from '../sessionState'
import { SessionPersistence } from '../sessionConstants'
import type { Configuration } from '../../configuration'

describe('session in service worker strategy', () => {
  const DEFAULT_INIT_CONFIGURATION = { trackAnonymousUser: true } as Configuration
  const sessionState: SessionState = { id: '123', created: '0' }
  let serviceWorkerStrategy: SessionStoreStrategy

  let fakeCacheStore: Record<string, string>
  let originalCaches: any

  beforeEach(async () => {
    fakeCacheStore = {}

    const mockCaches = {
      open: jasmine.createSpy('open').and.callFake(() => {
        return Promise.resolve({
          match: jasmine.createSpy('match').and.callFake((key: string) => {
            if (fakeCacheStore[key]) {
              return Promise.resolve(new Response(fakeCacheStore[key]))
            }
            return Promise.resolve(undefined)
          }),
          put: jasmine.createSpy('put').and.callFake((key: string, response: Response) => {
            return response.text().then((text: string) => {
              fakeCacheStore[key] = text
            })
          }),
        })
      }),
      delete: jasmine.createSpy('delete'),
      has: jasmine.createSpy('has'),
      keys: jasmine.createSpy('keys'),
      match: jasmine.createSpy('match')
    }

    originalCaches = Object.getOwnPropertyDescriptor(window, 'caches')

    Object.defineProperty(window, 'caches', {
      get: () => mockCaches,
      configurable: true
    })

    serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  afterEach(() => {
    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches)
    } else {
      // If we removed the property, restore it
      Object.defineProperty(window, 'caches', {
        get: () => undefined,
        configurable: true
      })
    }
  })

  describe('when caches API is available', () => {
    it('should report service worker strategy as available', () => {
      const available = selectNewStrategy()
      expect(available).toEqual({ type: SessionPersistence.SERVICE_WORKER })
    })

    it('should persist a session in cache', async () => {
      serviceWorkerStrategy.persistSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      const session = serviceWorkerStrategy.retrieveSession()
      expect(session).toEqual({ ...sessionState })
      expect(fakeCacheStore[SESSION_STORE_KEY]).toEqual(toSessionString(sessionState))
    })

    it('should set `isExpired=1` and add an anonymousId when expiring a session', async () => {
      serviceWorkerStrategy.persistSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      serviceWorkerStrategy.expireSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      const session = serviceWorkerStrategy.retrieveSession()
      expect(session).toEqual({ isExpired: '1', anonymousId: jasmine.any(String) })
      expect(fakeCacheStore[SESSION_STORE_KEY]).toEqual(toSessionString(session))
    })

    it('should return an empty object if session string is invalid', async () => {
      fakeCacheStore[SESSION_STORE_KEY] = '{test:42}'
      serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
      await new Promise(resolve => setTimeout(resolve, 10))
      const session = serviceWorkerStrategy.retrieveSession()
      expect(session).toEqual({})
    })

    it('should not interfere with other cache entries', async () => {
      fakeCacheStore['other-key'] = 'hello'
      serviceWorkerStrategy.persistSession(sessionState)
      serviceWorkerStrategy.retrieveSession()
      serviceWorkerStrategy.expireSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(fakeCacheStore['other-key']).toEqual('hello')
    })

    it('should handle cache operation errors gracefully', async () => {
      const consoleSpy = spyOn(console, 'error')
      const mockCaches = {
        open: jasmine.createSpy('open').and.returnValue(Promise.reject(new Error('Cache error')))
      }

      Object.defineProperty(window, 'caches', {
        get: () => mockCaches,
        configurable: true
      })

      serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load session from Cache API', jasmine.any(Error))
    })

    it('should handle persist operation errors gracefully', async () => {
      const consoleSpy = spyOn(console, 'error')
      const mockCaches = {
        open: jasmine.createSpy('open').and.callFake(() => {
          return Promise.resolve({
            match: jasmine.createSpy('match').and.returnValue(Promise.resolve(new Response(''))),
            put: jasmine.createSpy('put').and.callFake(() => {
              return Promise.reject(new Error('Put error')).catch(error => {
                console.error('Failed to persist session to Cache API', error)
                return Promise.reject(error)
              })
            })
          })
        })
      }

      Object.defineProperty(window, 'caches', {
        get: () => mockCaches,
        configurable: true
      })

      serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
      await new Promise(resolve => setTimeout(resolve, 10))
      
      serviceWorkerStrategy.persistSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(consoleSpy).toHaveBeenCalledWith('Failed to persist session to Cache API', jasmine.any(Error))
    })

    it('should handle expire operation errors gracefully', async () => {
      const consoleSpy = spyOn(console, 'error')
      const mockCaches = {
        open: jasmine.createSpy('open').and.callFake(() => {
          return Promise.resolve({
            match: jasmine.createSpy('match').and.returnValue(Promise.resolve(new Response(''))),
            put: jasmine.createSpy('put').and.callFake(() => {
              return Promise.reject(new Error('Put error')).catch(error => {
                console.error('Failed to expire session in Cache API', error)
                return Promise.reject(error)
              })
            })
          })
        })
      }

      Object.defineProperty(window, 'caches', {
        get: () => mockCaches,
        configurable: true
      })

      serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
      await new Promise(resolve => setTimeout(resolve, 10))
      
      serviceWorkerStrategy.expireSession(sessionState)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(consoleSpy).toHaveBeenCalledWith('Failed to expire session in Cache API', jasmine.any(Error))
    })
  })

  describe('when caches API is not available', () => {
    beforeEach(() => {
      // Remove caches from window completely
      delete (window as any).caches
    })

    it('should return undefined when selecting strategy', () => {
      const available = selectNewStrategy()
      expect(available).toBeUndefined()
    })

    it('should handle operations without caches API', async () => {
      serviceWorkerStrategy = initNewStrategy(DEFAULT_INIT_CONFIGURATION)
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // These operations should not throw errors
      serviceWorkerStrategy.persistSession(sessionState)
      const session = serviceWorkerStrategy.retrieveSession()
      expect(session).toEqual({ ...sessionState })

      serviceWorkerStrategy.expireSession(sessionState)
      const expiredSession = serviceWorkerStrategy.retrieveSession()
      expect(expiredSession).toEqual({ isExpired: '1', anonymousId: jasmine.any(String) })
    })
  })
})
