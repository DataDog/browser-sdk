import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import { getCookie, setCookie, COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import type { SessionStore } from './sessionStore'
import { startSessionStore, selectSessionStoreStrategyType } from './sessionStore'
import { SESSION_COOKIE_NAME } from './storeStrategies/sessionInCookie'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'

const enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = 'not-tracked',
}

const DURATION = 123456
const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'

function setSessionInStore(trackingType: FakeTrackingType = FakeTrackingType.TRACKED, id?: string, expire?: number) {
  setCookie(
    SESSION_COOKIE_NAME,
    `${id ? `id=${id}&` : ''}${PRODUCT_KEY}=${trackingType}&created=${Date.now()}&expire=${
      expire || Date.now() + SESSION_EXPIRATION_DELAY
    }`,
    DURATION
  )
}

function expectTrackedSessionToBeInStore(id?: string) {
  expect(getCookie(SESSION_COOKIE_NAME)).toMatch(new RegExp(`id=${id ? id : '[a-f0-9-]+'}`))
  expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${PRODUCT_KEY}=${FakeTrackingType.TRACKED}`)
}

function expectNotTrackedSessionToBeInStore() {
  expect(getCookie(SESSION_COOKIE_NAME)).not.toContain('id=')
  expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${PRODUCT_KEY}=${FakeTrackingType.NOT_TRACKED}`)
}

function getStoreExpiration() {
  return /expire=(\d+)/.exec(getCookie(SESSION_COOKIE_NAME)!)?.[1]
}

function resetSessionInStore() {
  setCookie(SESSION_COOKIE_NAME, '', DURATION)
}

describe('session store', () => {
  describe('getSessionStoreStrategyType', () => {
    it('should return a type cookie when cookies are available', () => {
      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        clientToken: 'abc',
        allowFallbackToLocalStorage: true,
      })
      expect(sessionStoreStrategyType).toEqual(jasmine.objectContaining({ type: 'Cookie' }))
    })

    it('should report undefined when cookies are not available, and fallback is not allowed', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        clientToken: 'abc',
        allowFallbackToLocalStorage: false,
      })
      expect(sessionStoreStrategyType).toBeUndefined()
    })

    it('should fallback to localStorage when cookies are not available', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        clientToken: 'abc',
        allowFallbackToLocalStorage: true,
      })
      expect(sessionStoreStrategyType).toEqual({ type: 'LocalStorage' })
    })

    it('should report undefined when no storage is available', () => {
      spyOnProperty(document, 'cookie', 'get').and.returnValue('')
      spyOn(Storage.prototype, 'getItem').and.throwError('unavailable')
      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        clientToken: 'abc',
        allowFallbackToLocalStorage: true,
      })
      expect(sessionStoreStrategyType).toBeUndefined()
    })
  })

  describe('session lifecyle mechanism', () => {
    let expireSpy: () => void
    let renewSpy: () => void
    let sessionStoreManager: SessionStore
    let clock: Clock

    function setupSessionStore(
      computeSessionState: (rawTrackingType?: string) => {
        trackingType: FakeTrackingType
        isTracked: boolean
      } = () => ({
        isTracked: true,
        trackingType: FakeTrackingType.TRACKED,
      })
    ) {
      const sessionStoreStrategyType = selectSessionStoreStrategyType({
        clientToken: 'abc',
        allowFallbackToLocalStorage: false,
      })
      if (sessionStoreStrategyType?.type !== 'Cookie') {
        fail('Unable to initialize cookie storage')
        return
      }
      sessionStoreManager = startSessionStore(sessionStoreStrategyType, PRODUCT_KEY, computeSessionState)
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
          expect(renewSpy).toHaveBeenCalled()
        }
      )

      it(
        'when session not in cache, session not in store and new session not tracked, ' +
          'should store not tracked session',
        () => {
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).not.toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )

      it('when session not in cache and session in store, should expand session and trigger renew session', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        sessionStoreManager.expandOrRenewSession()

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expectTrackedSessionToBeInStore(FIRST_ID)
        expect(expireSpy).not.toHaveBeenCalled()
        expect(renewSpy).toHaveBeenCalled()
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
          expect(renewSpy).toHaveBeenCalled()
        }
      )

      it(
        'when session in cache, session not in store and new session not tracked, ' +
          'should expire session and store not tracked session',
        () => {
          setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))
          resetSessionInStore()

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )

      it(
        'when session not tracked in cache, session not in store and new session not tracked, ' +
          'should expire session and store not tracked session',
        () => {
          setSessionInStore(FakeTrackingType.NOT_TRACKED)
          setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))
          resetSessionInStore()

          sessionStoreManager.expandOrRenewSession()

          expect(sessionStoreManager.getSession().id).toBeUndefined()
          expect(sessionStoreManager.getSession()[PRODUCT_KEY]).toBeDefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
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
          expect(renewSpy).toHaveBeenCalled()
        }
      )

      it(
        'when session in cache is different session than in store and store session is not tracked, ' +
          'should expire session and store not tracked session',
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
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )
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

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should synchronize session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID, Date.now() + SESSION_TIME_OUT_DELAY + 10)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBe(FIRST_ID)
        expect(sessionStoreManager.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session id in cache is different than session id in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session type in cache is different than session type in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.NOT_TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStoreManager.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })
    })
  })
})
