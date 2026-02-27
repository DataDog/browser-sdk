import type { Clock } from '../../../test'
import { mockClock, createFakeSessionStoreStrategy, replaceMockable } from '../../../test'
import { display } from '../../tools/display'
import type { InitConfiguration, Configuration } from '../configuration'
import { withNativeSessionLock } from './sessionLock'
import type { SessionStore } from './sessionStore'
import { STORAGE_POLL_DELAY, startSessionStore, selectSessionStoreStrategyType } from './sessionStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionState } from './sessionState'

const FIRST_ID = 'first'
const SECOND_ID = 'second'
const IS_EXPIRED = '1'
const DEFAULT_INIT_CONFIGURATION: InitConfiguration = { clientToken: 'abc' }
const DEFAULT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

function createSessionState(id?: string, expire?: number): SessionState {
  return {
    created: `${Date.now()}`,
    expire: `${expire || Date.now() + SESSION_EXPIRATION_DELAY}`,
    ...(id ? { id } : {}),
  }
}

let sessionStoreStrategy: ReturnType<typeof createFakeSessionStoreStrategy>
let lockQueue: Promise<void>

function mockLock() {
  lockQueue = Promise.resolve()
  replaceMockable(withNativeSessionLock, (fn: () => void | Promise<void>) => {
    lockQueue = lockQueue.then(fn, fn)
  })
}

async function flushLock() {
  await lockQueue
}

function getSessionStoreState(): Promise<SessionState> {
  return sessionStoreStrategy.retrieveSession()
}

async function expectSessionToBeInStore(id?: string) {
  const state = await getSessionStoreState()
  expect(state.id).toEqual(id ? id : jasmine.any(String))
  expect(state.isExpired).toBeUndefined()
}

async function expectSessionToBeExpiredInStore() {
  const state = await getSessionStoreState()
  expect(state.isExpired).toEqual(IS_EXPIRED)
  expect(state.id).toBeUndefined()
}

async function getStoreExpiration() {
  return (await getSessionStoreState()).expire
}

function resetSessionInStore() {
  sessionStoreStrategy.expireSession()
  sessionStoreStrategy.expireSession.calls.reset()
}

async function setSessionInStore(sessionState: SessionState) {
  await sessionStoreStrategy.persistSession(sessionState)
  sessionStoreStrategy.persistSession.calls.reset()
}

describe('session store', () => {
  describe('selectSessionStoreStrategyType', () => {
    describe('sessionPersistence: cookie (default)', () => {
      it('returns cookie strategy when cookies are available', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('returns undefined when cookies are not available', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('returns cookie strategy when sessionPersistence is cookie', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.COOKIE,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })
    })

    describe('sessionPersistence: local-storage', () => {
      it('returns local storage strategy when sessionPersistence is local storage', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.LOCAL_STORAGE,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined when local storage is not available', () => {
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.LOCAL_STORAGE,
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })
    })

    describe('sessionPersistence: memory', () => {
      it('returns memory strategy when sessionPersistence is memory', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.MEMORY,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })
    })

    it('returns undefined when sessionPersistence is invalid', () => {
      const displayErrorSpy = spyOn(display, 'error')

      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        ...DEFAULT_INIT_CONFIGURATION,
        sessionPersistence: 'invalid' as SessionPersistence,
      })
      expect(sessionStoreStrategyType).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
    })

    describe('sessionPersistence as array', () => {
      it('returns the first available strategy from the array', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('falls back to next strategy when first is unavailable', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('falls back to memory when cookie and local storage are unavailable', () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE, SessionPersistence.MEMORY],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.MEMORY }))
      })

      it('returns undefined when no strategy in array is available', () => {
        disableCookies()
        disableLocalStorage()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles empty array', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('handles array with single element', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.LOCAL_STORAGE],
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('stops at first available strategy and does not try subsequent ones', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: [SessionPersistence.LOCAL_STORAGE, SessionPersistence.COOKIE],
        })
        // Should return local storage (first available), not cookie
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.LOCAL_STORAGE }))
      })

      it('returns undefined and logs error if array contains invalid persistence type', () => {
        const displayErrorSpy = spyOn(display, 'error')
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: ['invalid' as SessionPersistence],
        })
        expect(sessionStoreStrategyType).toBeUndefined()
        expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
      })
    })

    describe('allowFallbackToLocalStorage (deprecated)', () => {
      it('should return a type cookie when cookies are available', () => {
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          allowFallbackToLocalStorage: true,
        })
        expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: SessionPersistence.COOKIE }))
      })

      it('should report undefined when cookies are not available, and fallback is not allowed', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          allowFallbackToLocalStorage: false,
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('should fallback to localStorage when cookies are not available', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          allowFallbackToLocalStorage: true,
        })
        expect(sessionStoreStrategyType).toEqual({ type: SessionPersistence.LOCAL_STORAGE })
      })

      it('should report undefined when no storage is available', () => {
        disableLocalStorage()
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          allowFallbackToLocalStorage: true,
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })

      it('does not fallback to localStorage when sessionPersistence is set to cookie', () => {
        disableCookies()
        const sessionStoreStrategyType = selectSessionStoreStrategyType({
          ...DEFAULT_INIT_CONFIGURATION,
          sessionPersistence: SessionPersistence.COOKIE,
          allowFallbackToLocalStorage: true,
        })
        expect(sessionStoreStrategyType).toBeUndefined()
      })
    })

    function disableCookies() {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
    }
    function disableLocalStorage() {
      spyOn(Storage.prototype, 'getItem').and.throwError('unavailable')
    }
  })

  describe('session lifecyle mechanism', () => {
    let expireSpy: () => void
    let renewSpy: () => void
    let sessionStoreManager: SessionStore
    let clock: Clock

    async function setupSessionStore(initialState: SessionState = {}) {
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
      if (sessionStoreStrategyType?.type !== SessionPersistence.COOKIE) {
        fail('Unable to initialize cookie storage')
        return
      }

      sessionStoreStrategy = createFakeSessionStoreStrategy({ initialSession: initialState })

      sessionStoreManager = startSessionStore(sessionStoreStrategyType, DEFAULT_CONFIGURATION, sessionStoreStrategy)
      await flushLock()
      sessionStoreStrategy.persistSession.calls.reset()
      sessionStoreManager.expireObservable.subscribe(expireSpy)
      sessionStoreManager.renewObservable.subscribe(renewSpy)
    }

    beforeEach(() => {
      mockLock()
      expireSpy = jasmine.createSpy('expire session')
      renewSpy = jasmine.createSpy('renew session')
      clock = mockClock()
    })

    afterEach(() => {
      resetSessionInStore()
      sessionStoreManager.stop()
    })

    describe('initialize session', () => {
      it('when session not in store, should initialize a new session', async () => {
        await setupSessionStore()
        expect(sessionStoreManager.getSession().isExpired).toEqual(IS_EXPIRED)
        expect(sessionStoreManager.getSession().anonymousId).toEqual(jasmine.any(String))
      })

      it('when session in store, should do nothing', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
      })

      it('should generate an anonymousId if not present', async () => {
        await setupSessionStore()
        expect(sessionStoreManager.getSession().anonymousId).toBeDefined()
      })
    })

    describe('expand or renew session', () => {
      it('when session not in cache and session not in store, should create new session and trigger renew session', async () => {
        await setupSessionStore()

        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeDefined()
        await expectSessionToBeInStore()
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalledTimes(1)
      })

      it('when session not in cache and session in store, should expand session and trigger renew session', async () => {
        await setupSessionStore()
        await setSessionInStore(createSessionState(FIRST_ID))

        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        await expectSessionToBeInStore(FIRST_ID)
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalledTimes(1)
      })

      it('when session in cache and session not in store, should expire session, create a new one and trigger renew session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        resetSessionInStore()

        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        const sessionId = sessionStoreManager.getSession().id
        expect(sessionId).toBeDefined()
        expect(sessionId).not.toBe(FIRST_ID)
        await expectSessionToBeInStore(sessionId)
        expect(expireSpy).toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalledTimes(1)
      })

      it('when session in cache is same session than in store, should expand session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        clock.tick(10)
        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(await getStoreExpiration())
        await expectSessionToBeInStore(FIRST_ID)
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).not.toHaveBeenCalled()
      })

      it('when session in cache is different session than in store, should expire session, expand store session and trigger renew', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        await setSessionInStore(createSessionState(SECOND_ID))

        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(SECOND_ID)
        await expectSessionToBeInStore(SECOND_ID)
        expect(expireSpy).toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalledTimes(1)
      })

      it('when throttled, expandOrRenewSession() should not renew the session if expire() is called right after', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        // The first call is not throttled (leading execution)
        sessionStoreManager.expandOrRenewSession()
        await flushLock()

        sessionStoreManager.expandOrRenewSession()
        sessionStoreManager.expire()

        clock.tick(STORAGE_POLL_DELAY)
        await flushLock()

        await expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(renewSpy).not.toHaveBeenCalled()
      })

      it('should execute callback after session expansion', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        const callbackSpy = jasmine.createSpy('callback')
        sessionStoreManager.expandOrRenewSession(callbackSpy)
        await flushLock()

        expect(callbackSpy).toHaveBeenCalledTimes(1)
      })
    })

    describe('expand session', () => {
      it('when session not in cache and session not in store, should do nothing', async () => {
        await setupSessionStore()

        sessionStoreManager.expandSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', async () => {
        await setupSessionStore()
        await setSessionInStore(createSessionState(FIRST_ID))

        sessionStoreManager.expandSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        resetSessionInStore()

        sessionStoreManager.expandSession()
        await flushLock()

        await expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should expand session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        clock.tick(10)
        sessionStoreManager.expandSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(await getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache is different session than in store, should expire session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        await setSessionInStore(createSessionState(SECOND_ID))

        sessionStoreManager.expandSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        await expectSessionToBeInStore(SECOND_ID)
        expect(expireSpy).toHaveBeenCalled()
      })
    })

    describe('external change watch', () => {
      it('when session not in cache and session not in store, should store the expired session', async () => {
        await setupSessionStore()
        sessionStoreStrategy.expireSession.calls.reset()

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        await expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.expireSession).toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        resetSessionInStore()
        sessionStoreStrategy.expireSession.calls.reset()

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        await expectSessionToBeExpiredInStore()
        expect(expireSpy).toHaveBeenCalled()
        expect(sessionStoreStrategy.expireSession).toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', async () => {
        await setupSessionStore()
        await setSessionInStore(createSessionState(FIRST_ID))

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should synchronize session', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        await setSessionInStore(createSessionState(FIRST_ID, Date.now() + SESSION_TIME_OUT_DELAY + 10))

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(await getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session id in cache is different than session id in store, should expire session and not touch the store', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        await setSessionInStore(createSessionState(SECOND_ID))

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session in store is expired first and then get updated by another tab, should expire session in cache', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))
        resetSessionInStore()

        // Simulate another tab writing a new session between the reset and the watch tick
        await setSessionInStore(createSessionState(SECOND_ID))

        sessionStoreStrategy.notifyExternalChange()
        await flushLock()

        // The watch sees SECOND_ID which differs from the cached FIRST_ID, so it expires the cache
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })
    })

    describe('reinitialize session', () => {
      it('when session not in store, should reinitialize the store', async () => {
        await setupSessionStore()

        sessionStoreManager.restartSession()
        await flushLock()

        expect(sessionStoreManager.getSession().isExpired).toEqual(IS_EXPIRED)
        expect(sessionStoreManager.getSession().anonymousId).toEqual(jasmine.any(String))
      })

      it('when session in store, should do nothing', async () => {
        await setupSessionStore(createSessionState(FIRST_ID))

        sessionStoreManager.restartSession()
        await flushLock()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
      })

      it('restart session should generate an anonymousId if not present', async () => {
        await setupSessionStore()
        sessionStoreManager.restartSession()
        await flushLock()
        expect(sessionStoreManager.getSession().anonymousId).toBeDefined()
      })
    })
  })

  describe('session update and synchronisation', () => {
    let updateSpy: jasmine.Spy<jasmine.Func>
    let otherUpdateSpy: jasmine.Spy<jasmine.Func>

    async function setupSessionStoreWithObserver(initialState: SessionState = {}, updateSpyFn: () => void) {
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)

      sessionStoreStrategy = createFakeSessionStoreStrategy({ initialSession: initialState })

      const sessionStoreManager = startSessionStore(
        sessionStoreStrategyType!,
        DEFAULT_CONFIGURATION,
        sessionStoreStrategy
      )
      await flushLock()
      sessionStoreManager.sessionStateUpdateObservable.subscribe(updateSpyFn)

      return sessionStoreManager
    }

    let sessionStoreManager: SessionStore
    let otherSessionStoreManager: SessionStore

    beforeEach(() => {
      mockLock()
      updateSpy = jasmine.createSpy()
      otherUpdateSpy = jasmine.createSpy()
      mockClock()
    })

    afterEach(() => {
      resetSessionInStore()
      sessionStoreManager.stop()
      otherSessionStoreManager.stop()
    })

    it('should synchronise all stores and notify update observables of all stores', async () => {
      const initialState = createSessionState(FIRST_ID)
      sessionStoreManager = await setupSessionStoreWithObserver(initialState, updateSpy)
      otherSessionStoreManager = await setupSessionStoreWithObserver(initialState, otherUpdateSpy)

      sessionStoreManager.updateSessionState({ extra: 'extra' })
      await flushLock()

      expect(updateSpy).toHaveBeenCalledTimes(1)

      const callArgs = updateSpy.calls.argsFor(0)[0]
      expect(callArgs!.previousState.extra).toBeUndefined()
      expect(callArgs.newState.extra).toBe('extra')

      // Notify external change to sync the other store
      sessionStoreStrategy.notifyExternalChange()
      await flushLock()
      expect(otherUpdateSpy).toHaveBeenCalled()
    })
  })
})
