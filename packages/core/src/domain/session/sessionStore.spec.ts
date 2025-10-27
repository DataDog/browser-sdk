import type { Clock } from '../../../test'
import { mockClock, createFakeSessionStoreStrategy } from '../../../test'
import type { InitConfiguration, Configuration } from '../configuration'
import { display } from '../../tools/display'
import type { SessionStore } from './sessionStore'
import { STORAGE_POLL_DELAY, startSessionStore, selectSessionStoreStrategyType } from './sessionStore'
import {
  SESSION_EXPIRATION_DELAY,
  SESSION_NOT_TRACKED,
  SESSION_TIME_OUT_DELAY,
  SessionPersistence,
} from './sessionConstants'
import type { SessionState } from './sessionState'

const enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = SESSION_NOT_TRACKED,
}

const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'
const IS_EXPIRED = '1'
const DEFAULT_INIT_CONFIGURATION: InitConfiguration = { clientToken: 'abc' }
const DEFAULT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

const EMPTY_SESSION_STATE: SessionState = {}

function createSessionState(
  trackingType: FakeTrackingType = FakeTrackingType.TRACKED,
  id?: string,
  expire?: number
): SessionState {
  return {
    [PRODUCT_KEY]: trackingType,
    created: `${Date.now()}`,
    expire: `${expire || Date.now() + SESSION_EXPIRATION_DELAY}`,
    ...(id ? { id } : {}),
  }
}

let sessionStoreStrategy: ReturnType<typeof createFakeSessionStoreStrategy>

function getSessionStoreState(): SessionState {
  return sessionStoreStrategy.retrieveSession()
}

function expectTrackedSessionToBeInStore(id?: string) {
  expect(getSessionStoreState().id).toEqual(id ? id : jasmine.any(String))
  expect(getSessionStoreState().isExpired).toBeUndefined()
  expect(getSessionStoreState()[PRODUCT_KEY]).toEqual(FakeTrackingType.TRACKED)
}

function expectNotTrackedSessionToBeInStore() {
  expect(getSessionStoreState().id).toBeUndefined()
  expect(getSessionStoreState().isExpired).toBeUndefined()
  expect(getSessionStoreState()[PRODUCT_KEY]).toEqual(FakeTrackingType.NOT_TRACKED)
}

function expectSessionToBeExpiredInStore() {
  expect(getSessionStoreState().isExpired).toEqual(IS_EXPIRED)
  expect(getSessionStoreState().id).toBeUndefined()
  expect(getSessionStoreState()[PRODUCT_KEY]).toBeUndefined()
}

function getStoreExpiration() {
  return getSessionStoreState().expire
}

function resetSessionInStore() {
  sessionStoreStrategy.expireSession()
  sessionStoreStrategy.expireSession.calls.reset()
}

function setSessionInStore(sessionState: SessionState) {
  sessionStoreStrategy.persistSession(sessionState)
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

    it('returns undefined when sessionPersistence is invalid', () => {
      const displayErrorSpy = spyOn(display, 'error')

      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        ...DEFAULT_INIT_CONFIGURATION,
        sessionPersistence: 'invalid' as SessionPersistence,
      })
      expect(sessionStoreStrategyType).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith("Invalid session persistence 'invalid'")
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

    function setupSessionStore(
      initialState: SessionState = {},
      computeTrackingType: (rawTrackingType?: string) => FakeTrackingType = () => FakeTrackingType.TRACKED
    ) {
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
      if (sessionStoreStrategyType?.type !== SessionPersistence.COOKIE) {
        fail('Unable to initialize cookie storage')
        return
      }

      sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession: initialState })

      sessionStoreManager = startSessionStore(
        sessionStoreStrategyType,
        DEFAULT_CONFIGURATION,
        PRODUCT_KEY,
        computeTrackingType,
        sessionStoreStrategy
      )
      sessionStoreStrategy.persistSession.calls.reset()
      sessionStoreManager.expireObservable.subscribe(expireSpy)
      sessionStoreManager.renewObservable.subscribe(renewSpy)
    }

    beforeEach(() => {
      expireSpy = jasmine.createSpy('expire session')
      renewSpy = jasmine.createSpy('renew session')
      clock = mockClock()
    })

    afterEach(() => {
      resetSessionInStore()
      sessionStoreManager.stop()
    })

    describe('initialize session', () => {
      it('when session not in store, should initialize a new session', () => {
        setupSessionStore()
        expect(sessionStoreManager.getSession().isExpired).toEqual(IS_EXPIRED)
        expect(sessionStoreManager.getSession().anonymousId).toEqual(jasmine.any(String))
      })

      it('when tracked session in store, should do nothing ', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
        expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
      })

      it('when not tracked session in store, should do nothing ', () => {
        setupSessionStore(createSessionState(FakeTrackingType.NOT_TRACKED))

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
        expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
      })

      it('should generate an anonymousId if not present', () => {
        setupSessionStore()
        expect(sessionStoreManager.getSession().anonymousId).toBeDefined()
      })
    })

    describe('expand or renew session', () => {
      it(
        'when session not in cache, session not in store and new session tracked, ' +
          'should create new session and trigger renew session ',
        () => {
          setupSessionStore()

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeDefined()
          expectTrackedSessionToBeInStore()
          expect(expireSpy).not.toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it(
        'when session not in cache, session not in store and new session not tracked, ' +
          'should store not tracked session and trigger renew session',
        () => {
          setupSessionStore(EMPTY_SESSION_STATE, () => FakeTrackingType.NOT_TRACKED)

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).not.toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it('when session not in cache and session in store, should expand session and trigger renew session', () => {
        setupSessionStore()
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        sessionStoreManager.expandOrRenewSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expectTrackedSessionToBeInStore(FIRST_ID)
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalledTimes(1)
      })

      it(
        'when session in cache, session not in store and new session tracked, ' +
          'should expire session, create a new one and trigger renew session',
        () => {
          setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
          resetSessionInStore()

          sessionStoreManager.expandOrRenewSession()

          const sessionId = sessionStoreManager.getSession().id
          expect(sessionId).toBeDefined()
          expect(sessionId).not.toBe(FIRST_ID)
          expectTrackedSessionToBeInStore(sessionId)
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it(
        'when session in cache, session not in store and new session not tracked, ' +
          'should expire session, store not tracked session and trigger renew session',
        () => {
          setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID), () => FakeTrackingType.NOT_TRACKED)
          resetSessionInStore()

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it(
        'when session not tracked in cache, session not in store and new session not tracked, ' +
          'should expire session, store not tracked session and trigger renew session',
        () => {
          setupSessionStore(createSessionState(FakeTrackingType.NOT_TRACKED), () => FakeTrackingType.NOT_TRACKED)
          resetSessionInStore()

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it('when session in cache is same session than in store, should expand session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        clock.tick(10)
        sessionStoreManager.expandOrRenewSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expectTrackedSessionToBeInStore(FIRST_ID)
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).not.toHaveBeenCalled()
      })

      it(
        'when session in cache is different session than in store and store session is tracked, ' +
          'should expire session, expand store session and trigger renew',
        () => {
          setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
          setSessionInStore(createSessionState(FakeTrackingType.TRACKED, SECOND_ID))

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBe(SECOND_ID)
          expectTrackedSessionToBeInStore(SECOND_ID)
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it(
        'when session in cache is different session than in store and store session is not tracked, ' +
          'should expire session, store not tracked session and trigger renew',
        () => {
          setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID), (rawTrackingType) =>
            rawTrackingType === FakeTrackingType.TRACKED ? FakeTrackingType.TRACKED : FakeTrackingType.NOT_TRACKED
          )
          setSessionInStore(createSessionState(FakeTrackingType.NOT_TRACKED, ''))

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it('when throttled, expandOrRenewSession() should not renew the session if expire() is called right after', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        // The first call is not throttled (leading execution)
        sessionStoreManager.expandOrRenewSession()

        sessionStoreManager.expandOrRenewSession()
        sessionStoreManager.expire()

        clock.tick(STORAGE_POLL_DELAY)

        expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(renewSpy).not.toHaveBeenCalled()
      })
    })

    describe('expand session', () => {
      it('when session not in cache and session not in store, should do nothing', () => {
        setupSessionStore()

        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        resetSessionInStore()

        sessionStoreManager.expandSession()

        expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should expand session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        clock.tick(10)
        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache is different session than in store, should expire session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, SECOND_ID))

        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expectTrackedSessionToBeInStore(SECOND_ID)
        expect(expireSpy).toHaveBeenCalled()
      })
    })

    describe('regular watch', () => {
      it('when session not in cache and session not in store, should store the expired session', () => {
        setupSessionStore()

        clock.tick(STORAGE_POLL_DELAY)

        expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        resetSessionInStore()

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expectSessionToBeExpiredInStore()
        expect(expireSpy).toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should synchronize session', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        setSessionInStore(
          createSessionState(FakeTrackingType.TRACKED, FIRST_ID, Date.now() + SESSION_TIME_OUT_DELAY + 10)
        )

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session id in cache is different than session id in store, should expire session and not touch the store', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, SECOND_ID))

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })

      it('when session in store is expired first and then get updated by another tab, should expire session in cache and not touch the store', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))
        resetSessionInStore()

        // Simulate a new session being written to the store by another tab during the watch.
        // Watch is reading the cookie twice so we need to plan the write of the cookie at the right index
        sessionStoreStrategy.planRetrieveSession(1, createSessionState(FakeTrackingType.TRACKED, SECOND_ID))

        clock.tick(STORAGE_POLL_DELAY)

        // expires session in cache
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()

        // Does not touch the store
        // The two calls to persist session are for the lock management, these can be ignored
        expect(sessionStoreStrategy.persistSession).toHaveBeenCalledTimes(2)
        expect(sessionStoreStrategy.expireSession).not.toHaveBeenCalled()
      })

      it('when session type in cache is different than session type in store, should expire session and not touch the store', () => {
        setupSessionStore(createSessionState(FakeTrackingType.NOT_TRACKED, FIRST_ID))
        setSessionInStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
        expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
      })
    })

    describe('reinitialize session', () => {
      it('when session not in store, should reinitialize the store', () => {
        setupSessionStore()

        sessionStoreManager.restartSession()

        expect(sessionStoreManager.getSession().isExpired).toEqual(IS_EXPIRED)
        expect(sessionStoreManager.getSession().anonymousId).toEqual(jasmine.any(String))
      })

      it('when session in store, should do nothing', () => {
        setupSessionStore(createSessionState(FakeTrackingType.TRACKED, FIRST_ID))

        sessionStoreManager.restartSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
      })

      it('restart session should generate an anonymousId if not present', () => {
        setupSessionStore()
        sessionStoreManager.restartSession()
        expect(sessionStoreManager.getSession().anonymousId).toBeDefined()
      })
    })
  })

  describe('session update and synchronisation', () => {
    let updateSpy: jasmine.Spy<jasmine.Func>
    let otherUpdateSpy: jasmine.Spy<jasmine.Func>
    let clock: Clock

    function setupSessionStore(initialState: SessionState = {}, updateSpy: () => void) {
      const computeTrackingType: (rawTrackingType?: string) => FakeTrackingType = () => FakeTrackingType.TRACKED
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)

      sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession: initialState })

      const sessionStoreManager = startSessionStore(
        sessionStoreStrategyType!,
        DEFAULT_CONFIGURATION,
        PRODUCT_KEY,
        computeTrackingType,
        sessionStoreStrategy
      )
      sessionStoreManager.sessionStateUpdateObservable.subscribe(updateSpy)

      return sessionStoreManager
    }

    let sessionStoreManager: SessionStore
    let otherSessionStoreManager: SessionStore

    beforeEach(() => {
      updateSpy = jasmine.createSpy()
      otherUpdateSpy = jasmine.createSpy()
      clock = mockClock()
    })

    afterEach(() => {
      resetSessionInStore()
      sessionStoreManager.stop()
      otherSessionStoreManager.stop()
    })

    it('should synchronise all stores and notify update observables of all stores', () => {
      const initialState = createSessionState(FakeTrackingType.TRACKED, FIRST_ID)
      sessionStoreManager = setupSessionStore(initialState, updateSpy)
      otherSessionStoreManager = setupSessionStore(initialState, otherUpdateSpy)

      sessionStoreManager.updateSessionState({ extra: 'extra' })

      expect(updateSpy).toHaveBeenCalledTimes(1)

      const callArgs = updateSpy.calls.argsFor(0)[0]
      expect(callArgs!.previousState.extra).toBeUndefined()
      expect(callArgs.newState.extra).toBe('extra')

      // Need to wait until watch is triggered
      clock.tick(STORAGE_POLL_DELAY)
      expect(otherUpdateSpy).toHaveBeenCalled()
    })
  })
})
