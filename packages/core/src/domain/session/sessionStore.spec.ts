import type { Clock } from '../../../test'
import { expireCookie, mockClock, getSessionState } from '../../../test'
import { setCookie } from '../../browser/cookie'
import type { InitConfiguration, Configuration } from '../configuration'
import { display } from '../../tools/display'
import type { SessionStore } from './sessionStore'
import { STORAGE_POLL_DELAY, startSessionStore, selectSessionStoreStrategyType } from './sessionStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

const enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = 'not-tracked',
}

const DURATION = 123456
const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'
const IS_EXPIRED = '1'
const DEFAULT_INIT_CONFIGURATION: InitConfiguration = { clientToken: 'abc' }
const DEFAULT_CONFIGURATION = { trackAnonymousUser: true } as Configuration

function setSessionInStore(trackingType: FakeTrackingType = FakeTrackingType.TRACKED, id?: string, expire?: number) {
  setCookie(
    SESSION_STORE_KEY,
    `${id ? `id=${id}&` : ''}${PRODUCT_KEY}=${trackingType}&created=${Date.now()}&expire=${
      expire || Date.now() + SESSION_EXPIRATION_DELAY
    }`,
    DURATION
  )
}

function expectTrackedSessionToBeInStore(id?: string) {
  expect(getSessionState(SESSION_STORE_KEY).id).toEqual(id ? id : jasmine.any(String))
  expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
  expect(getSessionState(SESSION_STORE_KEY)[PRODUCT_KEY]).toEqual(FakeTrackingType.TRACKED)
}

function expectNotTrackedSessionToBeInStore() {
  expect(getSessionState(SESSION_STORE_KEY).id).toBeUndefined()
  expect(getSessionState(SESSION_STORE_KEY).isExpired).toBeUndefined()
  expect(getSessionState(SESSION_STORE_KEY)[PRODUCT_KEY]).toEqual(FakeTrackingType.NOT_TRACKED)
}

function expectSessionToBeExpiredInStore() {
  expect(getSessionState(SESSION_STORE_KEY).isExpired).toEqual(IS_EXPIRED)
  expect(getSessionState(SESSION_STORE_KEY).id).toBeUndefined()
  expect(getSessionState(SESSION_STORE_KEY)[PRODUCT_KEY]).toBeUndefined()
}

function getStoreExpiration() {
  return getSessionState(SESSION_STORE_KEY).expire
}

function resetSessionInStore() {
  expireCookie()
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
      computeSessionTrackingState: (rawTrackingType?: string) => {
        trackingType: FakeTrackingType
        isTracked: boolean
      } = () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      })
    ) {
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)
      if (sessionStoreStrategyType?.type !== SessionPersistence.COOKIE) {
        fail('Unable to initialize cookie storage')
        return
      }
      sessionStoreManager = startSessionStore(
        sessionStoreStrategyType,
        DEFAULT_CONFIGURATION,
        PRODUCT_KEY,
        computeSessionTrackingState
      )
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
      clock.cleanup()
      sessionStoreManager.stop()
    })

    describe('initialize session', () => {
      it('when session not in store, should initialize a new session', () => {
        setupSessionStore()
        expect(sessionStoreManager.getSession().isExpired).toEqual(IS_EXPIRED)
        expect(sessionStoreManager.getSession().anonymousId).toEqual(jasmine.any(String))
      })

      it('when tracked session in store, should do nothing ', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
        expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
      })

      it('when not tracked session in store, should do nothing ', () => {
        setSessionInStore(FakeTrackingType.NOT_TRACKED)
        setupSessionStore()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
        expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
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
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).not.toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it('when session not in cache and session in store, should expand session and trigger renew session', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

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
          setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
          setupSessionStore()
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
          setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))
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
          setSessionInStore(FakeTrackingType.NOT_TRACKED)
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))
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
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

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
          setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
          setupSessionStore()
          setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

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
          setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
          setupSessionStore((rawTrackingType) => ({
            isTracked: rawTrackingType === FakeTrackingType.TRACKED,
            trackingType: rawTrackingType as FakeTrackingType,
          }))
          setSessionInStore(FakeTrackingType.NOT_TRACKED, '')

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).toHaveBeenCalledTimes(1)
        }
      )

      it('when throttled, expandOrRenewSession() should not renew the session if expire() is called right after', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

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
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        sessionStoreManager.expandSession()

        expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should expand session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

        clock.tick(10)
        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache is different session than in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

        sessionStoreManager.expandSession()

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expectTrackedSessionToBeInStore(SECOND_ID)
        expect(expireSpy).toHaveBeenCalled()
      })
    })

    describe('regular watch', () => {
      it('when session not in cache and session not in store, should do nothing', () => {
        setupSessionStore()

        clock.tick(STORAGE_POLL_DELAY)

        expectSessionToBeExpiredInStore()
        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expectSessionToBeExpiredInStore()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should synchronize session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID, Date.now() + SESSION_TIME_OUT_DELAY + 10)

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session id in cache is different than session id in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session type in cache is different than session type in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.NOT_TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(STORAGE_POLL_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
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
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

        sessionStoreManager.restartSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().isExpired).toBeUndefined()
      })
    })
  })

  describe('session update and synchronisation', () => {
    let updateSpy: jasmine.Spy<jasmine.Func>
    let otherUpdateSpy: jasmine.Spy<jasmine.Func>
    let clock: Clock

    function setupSessionStore(updateSpy: () => void) {
      const computeSessionTrackingState: (rawTrackingType?: string) => {
        trackingType: FakeTrackingType
        isTracked: boolean
      } = () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      })
      const sessionStoreStrategyType = selectSessionStoreStrategyType(DEFAULT_INIT_CONFIGURATION)

      const sessionStoreManager = startSessionStore(
        sessionStoreStrategyType!,
        DEFAULT_CONFIGURATION,
        PRODUCT_KEY,
        computeSessionTrackingState
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
      clock.cleanup()
      sessionStoreManager.stop()
      otherSessionStoreManager.stop()
    })

    it('should synchronise all stores and notify update observables of all stores', () => {
      setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

      sessionStoreManager = setupSessionStore(updateSpy)
      otherSessionStoreManager = setupSessionStore(otherUpdateSpy)

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
