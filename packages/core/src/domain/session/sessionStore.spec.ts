import { Clock, mockClock } from '../../../test/specHelper'
import { CookieOptions, getCookie, setCookie, COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { startSessionStore, SESSION_COOKIE_NAME, SessionStore } from './sessionStore'

enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = 'not-tracked',
}

const DURATION = 123456
const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'
const COOKIE_OPTIONS: CookieOptions = {}

function setSessionInStore(id: string, trackingType: FakeTrackingType = FakeTrackingType.TRACKED) {
  setCookie(SESSION_COOKIE_NAME, `id=${id}&${PRODUCT_KEY}=${trackingType}`, DURATION)
}

function expectSessionToBeInStore(id?: string) {
  expect(getCookie(SESSION_COOKIE_NAME)).toMatch(new RegExp(`id=${id ? id : '[a-f0-9-]+'}`))
}

function expectNotTrackedSessionToBeInStore() {
  expect(getCookie(SESSION_COOKIE_NAME)).not.toContain(`id=`)
  expect(getCookie(SESSION_COOKIE_NAME)).toContain(`${PRODUCT_KEY}=${FakeTrackingType.NOT_TRACKED}`)
}

function resetSessionInStore() {
  setCookie(SESSION_COOKIE_NAME, '', DURATION)
}

describe('session store', () => {
  let renewSpy: () => void
  let sessionStore: SessionStore
  let clock: Clock

  function setupSessionStore(
    computeSessionState: (rawTrackingType?: string) => { trackingType: FakeTrackingType; isTracked: boolean } = () => ({
      isTracked: true,
      trackingType: FakeTrackingType.TRACKED,
    })
  ) {
    sessionStore = startSessionStore(COOKIE_OPTIONS, PRODUCT_KEY, computeSessionState)
    sessionStore.renewObservable.subscribe(renewSpy)
  }

  beforeEach(() => {
    renewSpy = jasmine.createSpy('renew session')
    clock = mockClock()
  })

  afterEach(() => {
    resetSessionInStore()
    clock.cleanup()
    sessionStore.stop()
  })

  describe('expand or renew session', () => {
    it(
      'when session not in cache, session not in store and new session tracked, ' +
        'should create new session and trigger renew session ',
      () => {
        setupSessionStore()

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBeDefined()
        expectSessionToBeInStore()
        expect(renewSpy).toHaveBeenCalled()
      }
    )

    it(
      'when session not in cache, session not in store and new session not tracked, ' +
        'should store not tracked session',
      () => {
        setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expectNotTrackedSessionToBeInStore()
        expect(renewSpy).not.toHaveBeenCalled()
      }
    )

    it('when session not in cache and session in store, should expand session and trigger renew session', () => {
      setupSessionStore()
      setSessionInStore(FIRST_ID)

      sessionStore.expandOrRenewSession()

      expect(sessionStore.getSession().id).toBe(FIRST_ID)
      expectSessionToBeInStore(FIRST_ID)
      expect(renewSpy).toHaveBeenCalled()
    })

    it(
      'when session in cache, session not in store and new session tracked, ' +
        'should expire session, create a new one and trigger renew session',
      () => {
        setSessionInStore(FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        sessionStore.expandOrRenewSession()

        const sessionId = sessionStore.getSession().id
        expect(sessionId).toBeDefined()
        expect(sessionId).not.toBe(FIRST_ID)
        expectSessionToBeInStore(sessionId)
        expect(renewSpy).toHaveBeenCalled()
      }
    )

    it(
      'when session in cache, session not in store and new session not tracked, ' + 'should store not tracked session',
      () => {
        setSessionInStore(FIRST_ID)
        setupSessionStore(() => ({ isTracked: false, trackingType: FakeTrackingType.NOT_TRACKED }))
        resetSessionInStore()

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expectNotTrackedSessionToBeInStore()
        expect(renewSpy).not.toHaveBeenCalled()
      }
    )

    it('when session in cache is same session than in store, should expand session', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()

      sessionStore.expandOrRenewSession()

      expect(sessionStore.getSession().id).toBe(FIRST_ID)
      expectSessionToBeInStore(FIRST_ID)
      expect(renewSpy).not.toHaveBeenCalled()
    })

    it(
      'when session in cache is different session than in store and store session is tracked, ' +
        'should expire session, expand store session and trigger renew',
      () => {
        setSessionInStore(FIRST_ID)
        setupSessionStore()
        setSessionInStore(SECOND_ID)

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBe(SECOND_ID)
        expectSessionToBeInStore(SECOND_ID)
        expect(renewSpy).toHaveBeenCalled()
      }
    )

    it(
      'when session in cache is different session than in store and store session is not tracked, ' +
        'should expire session, expand store session and trigger renew',
      () => {
        setSessionInStore(FIRST_ID)
        setupSessionStore((rawTrackingType) => ({
          isTracked: rawTrackingType === FakeTrackingType.TRACKED,
          trackingType: rawTrackingType as FakeTrackingType,
        }))
        setSessionInStore('', FakeTrackingType.NOT_TRACKED)

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expectNotTrackedSessionToBeInStore()
        expect(renewSpy).not.toHaveBeenCalled()
      }
    )
  })

  describe('expand session', () => {
    it('when session not in cache and session not in store, should do nothing', () => {
      setupSessionStore()

      sessionStore.expandSession()

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session not in cache and session in store, should do nothing', () => {
      setupSessionStore()
      setSessionInStore(FIRST_ID)

      sessionStore.expandSession()

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session in cache and session not in store, should clear session cache', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()
      resetSessionInStore()

      sessionStore.expandSession()

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session in cache is same session than in store, should expand session', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()

      sessionStore.expandSession()

      expect(sessionStore.getSession().id).toBe(FIRST_ID)
    })

    it('when session in cache is different session than in store, should clear session cache', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()
      setSessionInStore(SECOND_ID)

      sessionStore.expandSession()

      expect(sessionStore.getSession().id).toBeUndefined()
      expectSessionToBeInStore(SECOND_ID)
    })
  })

  describe('regular watch', () => {
    it('when session not in cache and session not in store, should do nothing', () => {
      setupSessionStore()

      clock.tick(COOKIE_ACCESS_DELAY)

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session not in cache and session in store, should do nothing', () => {
      setupSessionStore()
      setSessionInStore(FIRST_ID)

      clock.tick(COOKIE_ACCESS_DELAY)

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session in cache and session not in store, should clear session cache', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()
      resetSessionInStore()

      clock.tick(COOKIE_ACCESS_DELAY)

      expect(sessionStore.getSession().id).toBeUndefined()
    })

    it('when session in cache is same session than in store, should do nothing', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()

      clock.tick(COOKIE_ACCESS_DELAY)

      expect(sessionStore.getSession().id).toBe(FIRST_ID)
    })

    it('when session in cache is different session than in store, should clear session cache', () => {
      setSessionInStore(FIRST_ID)
      setupSessionStore()
      setSessionInStore(SECOND_ID)

      clock.tick(COOKIE_ACCESS_DELAY)

      expect(sessionStore.getSession().id).toBeUndefined()
    })
  })
})
