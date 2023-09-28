import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import { getCookie, setCookie } from '../../browser/cookie'
import type { SessionStore } from './sessionStore'
import {
  SessionStartPrecondition,
  STORAGE_POLL_DELAY,
  startSessionStore,
  selectSessionStoreStrategyType,
} from './sessionStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

const enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = 'not-tracked',
}

const DURATION = 123456
const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'
const THIRD_ID = 'third'

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
  expect(getCookie(SESSION_STORE_KEY)).toMatch(new RegExp(`id=${id ? id : '[a-f0-9-]+'}`))
  expect(getCookie(SESSION_STORE_KEY)).toContain(`${PRODUCT_KEY}=${FakeTrackingType.TRACKED}`)
}

function expectNotTrackedSessionToBeInStore() {
  expect(getCookie(SESSION_STORE_KEY)).not.toContain('id=')
  expect(getCookie(SESSION_STORE_KEY)).toContain(`${PRODUCT_KEY}=${FakeTrackingType.NOT_TRACKED}`)
}

function getStoreExpiration() {
  return /expire=(\d+)/.exec(getCookie(SESSION_STORE_KEY)!)?.[1]
}

function resetSessionInStore() {
  setCookie(SESSION_STORE_KEY, '', DURATION)
}

function computeFakeSessionState(rawTrackingType: string = FakeTrackingType.TRACKED) {
  return {
    isTracked: (rawTrackingType as FakeTrackingType) === FakeTrackingType.TRACKED,
    trackingType: rawTrackingType as FakeTrackingType,
  }
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
    let renewSpy: (sessionStartPrecondition: SessionStartPrecondition | undefined) => void
    let sessionStoreManager: SessionStore
    let clock: Clock

    function setupSessionStore(
      computeSessionState: (rawTrackingType?: string) => {
        trackingType: FakeTrackingType
        isTracked: boolean
      } = computeFakeSessionState
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

        clock.tick(STORAGE_POLL_DELAY)

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
  })
})

describe('session start_precondition', () => {
  let expireSpy: () => void
  let renewSpy: (sessionStartPrecondition: SessionStartPrecondition | undefined) => void
  let sessionStoreManager: SessionStore
  let clock: Clock

  function setupSessionStore() {
    const sessionStoreStrategyType = selectSessionStoreStrategyType({
      clientToken: 'abc',
      allowFallbackToLocalStorage: false,
    })
    if (sessionStoreStrategyType?.type !== 'Cookie') {
      fail('Unable to initialize cookie storage')
      return
    }
    sessionStoreManager = startSessionStore(sessionStoreStrategyType, PRODUCT_KEY, computeFakeSessionState)
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

  it('when no session in cache, different session in store tracked, renewed session should no have a precondition', () => {
    setupSessionStore()
    setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).not.toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(undefined)
  })

  it('when session in cache not tracked, different session in store tracked, renewed session should not have a precondition', () => {
    setSessionInStore(FakeTrackingType.NOT_TRACKED, FIRST_ID)
    setupSessionStore()
    setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(undefined)
  })

  it('when session in cache expired, different session in store tracked, renewed session should have "inactivity_timeout" precondition', () => {
    setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
    setupSessionStore()
    clock.setDate(new Date(Date.now() + SESSION_EXPIRATION_DELAY))
    setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(SessionStartPrecondition.InactivityTimeout)
  })

  it('when session in cache timed out, different session in store tracked, renewed session should have "max_duration" precondition', () => {
    setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
    setupSessionStore()
    clock.setDate(new Date(Date.now() + SESSION_TIME_OUT_DELAY))
    setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(SessionStartPrecondition.MaxDuration)
  })

  it('when session in cache active, different session in store tracked, renewed session should have "explicit_stop" precondition', () => {
    setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
    setupSessionStore()
    setSessionInStore(FakeTrackingType.TRACKED, THIRD_ID)

    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(SessionStartPrecondition.ExplicitStop)
  })

  it('renewed session should have the start_precondition of the last tracked session', () => {
    setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
    setupSessionStore()
    clock.setDate(new Date(Date.now() + SESSION_EXPIRATION_DELAY))
    setSessionInStore(FakeTrackingType.NOT_TRACKED, SECOND_ID)

    sessionStoreManager.expandOrRenewSession()

    setSessionInStore(FakeTrackingType.TRACKED, THIRD_ID)

    clock.tick(STORAGE_POLL_DELAY) // needed because expandOrRenewSession() is throttled
    sessionStoreManager.expandOrRenewSession()

    expect(expireSpy).toHaveBeenCalled()
    expect(renewSpy).toHaveBeenCalledOnceWith(SessionStartPrecondition.InactivityTimeout)
  })
})
