import type { Clock } from '../../../test'
import { stubCookie, mockClock } from '../../../test'
import type { CookieOptions } from '../../browser/cookie'
import { getCookie, setCookie, COOKIE_ACCESS_DELAY } from '../../browser/cookie'
import { isChromium } from '../../tools/utils/browserDetection'
import type { SessionStoreManager } from './sessionStoreManager'
import { processSessionStoreOperations, startSessionStoreManager } from './sessionStoreManager'
import { SESSION_COOKIE_NAME, initCookieStore, toSessionString } from './sessionCookieStore'
import { SESSION_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY } from './sessionConstants'
import type { SessionState, SessionStore } from './sessionStore'

const enum FakeTrackingType {
  TRACKED = 'tracked',
  NOT_TRACKED = 'not-tracked',
}

const DURATION = 123456
const PRODUCT_KEY = 'product'
const FIRST_ID = 'first'
const SECOND_ID = 'second'
const COOKIE_OPTIONS: CookieOptions = {}

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
  describe('session lifecyle mechanism', () => {
    let expireSpy: () => void
    let renewSpy: () => void
    let sessionStore: SessionStoreManager
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
      sessionStore = startSessionStoreManager(COOKIE_OPTIONS, PRODUCT_KEY, computeSessionState)
      sessionStore.expireObservable.subscribe(expireSpy)
      sessionStore.renewObservable.subscribe(renewSpy)
    }

    beforeEach(() => {
      expireSpy = jasmine.createSpy('expire session')
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

          sessionStore.expandOrRenewSession()

          expect(sessionStore.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).not.toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )

      it('when session not in cache and session in store, should expand session and trigger renew session', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBe(FIRST_ID)
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

          sessionStore.expandOrRenewSession()

          const sessionId = sessionStore.getSession().id
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

          sessionStore.expandOrRenewSession()

          expect(sessionStore.getSession().id).toBeUndefined()
          expect(sessionStore.getSession()[PRODUCT_KEY]).toBeDefined()
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

          sessionStore.expandOrRenewSession()

          expect(sessionStore.getSession().id).toBeUndefined()
          expect(sessionStore.getSession()[PRODUCT_KEY]).toBeDefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )

      it('when session in cache is same session than in store, should expand session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

        clock.tick(10)
        sessionStore.expandOrRenewSession()

        expect(sessionStore.getSession().id).toBe(FIRST_ID)
        expect(sessionStore.getSession().expire).toBe(getStoreExpiration())
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

          sessionStore.expandOrRenewSession()

          expect(sessionStore.getSession().id).toBe(SECOND_ID)
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

          sessionStore.expandOrRenewSession()

          expect(sessionStore.getSession().id).toBeUndefined()
          expectNotTrackedSessionToBeInStore()
          expect(expireSpy).toHaveBeenCalled()
          expect(renewSpy).not.toHaveBeenCalled()
        }
      )
    })

    describe('expand session', () => {
      it('when session not in cache and session not in store, should do nothing', () => {
        setupSessionStore()

        sessionStore.expandSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        sessionStore.expandSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        sessionStore.expandSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should expand session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()

        clock.tick(10)
        sessionStore.expandSession()

        expect(sessionStore.getSession().id).toBe(FIRST_ID)
        expect(sessionStore.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache is different session than in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

        sessionStore.expandSession()

        expect(sessionStore.getSession().id).toBeUndefined()
        expectTrackedSessionToBeInStore(SECOND_ID)
        expect(expireSpy).toHaveBeenCalled()
      })
    })

    describe('regular watch', () => {
      it('when session not in cache and session not in store, should do nothing', () => {
        setupSessionStore()

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session not in cache and session in store, should do nothing', () => {
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session in cache and session not in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        resetSessionInStore()

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session in cache is same session than in store, should synchronize session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID, Date.now() + SESSION_TIME_OUT_DELAY + 10)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBe(FIRST_ID)
        expect(sessionStore.getSession().expire).toBe(getStoreExpiration())
        expect(expireSpy).not.toHaveBeenCalled()
      })

      it('when session id in cache is different than session id in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, SECOND_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })

      it('when session type in cache is different than session type in store, should expire session', () => {
        setSessionInStore(FakeTrackingType.NOT_TRACKED, FIRST_ID)
        setupSessionStore()
        setSessionInStore(FakeTrackingType.TRACKED, FIRST_ID)

        clock.tick(COOKIE_ACCESS_DELAY)

        expect(sessionStore.getSession().id).toBeUndefined()
        expect(expireSpy).toHaveBeenCalled()
      })
    })
  })

  describe('process operations mechanism', () => {
    const COOKIE_OPTIONS = {}
    let initialSession: SessionState
    let otherSession: SessionState
    let processSpy: jasmine.Spy<jasmine.Func>
    let afterSpy: jasmine.Spy<jasmine.Func>
    let cookie: ReturnType<typeof stubCookie>
    let cookieStorage: SessionStore

    beforeEach(() => {
      cookieStorage = initCookieStore(COOKIE_OPTIONS)
      initialSession = { id: '123', created: '0' }
      otherSession = { id: '456', created: '100' }
      processSpy = jasmine.createSpy('process')
      afterSpy = jasmine.createSpy('after')
      cookie = stubCookie()
    })

    describe('with cookie-lock disabled', () => {
      beforeEach(() => {
        isChromium() && pending('cookie-lock only disabled on non chromium browsers')
      })

      it('should persist session when process returns a value', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process return an empty value', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.returnValue({})

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = {}
        expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should not persist session when process return undefined', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        expect(cookieStorage.retrieveSession()).toEqual(initialSession)
        expect(afterSpy).toHaveBeenCalledWith(initialSession)
      })
    })

    describe('with cookie-lock enabled', () => {
      beforeEach(() => {
        !isChromium() && pending('cookie-lock only enabled on chromium browsers')
      })

      it('should persist session when process return a value', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.callFake((session) => ({ ...otherSession, lock: session.lock }))

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process return an empty value', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.returnValue({})

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        const expectedSession = {}
        expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should not persist session when process return undefined', () => {
        cookieStorage.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
        expect(cookieStorage.retrieveSession()).toEqual(initialSession)
        expect(afterSpy).toHaveBeenCalledWith(initialSession)
      })

      type OnLockCheck = () => { currentState: SessionState; retryState: SessionState }

      function lockScenario({
        onInitialLockCheck,
        onAcquiredLockCheck,
        onPostProcessLockCheck,
        onPostPersistLockCheck,
      }: {
        onInitialLockCheck?: OnLockCheck
        onAcquiredLockCheck?: OnLockCheck
        onPostProcessLockCheck?: OnLockCheck
        onPostPersistLockCheck?: OnLockCheck
      }) {
        const onLockChecks = [onInitialLockCheck, onAcquiredLockCheck, onPostProcessLockCheck, onPostPersistLockCheck]
        cookie.getSpy.and.callFake(() => {
          const currentOnLockCheck = onLockChecks.shift()
          if (!currentOnLockCheck) {
            return cookie.currentValue()
          }
          const { currentState, retryState } = currentOnLockCheck()
          cookie.setCurrentValue(buildSessionString(retryState))
          return buildSessionString(currentState)
        })
      }

      function buildSessionString(currentState: SessionState) {
        return `${SESSION_COOKIE_NAME}=${toSessionString(currentState)}`
      }

      ;[
        {
          description: 'should wait for lock to be free',
          lockConflict: 'onInitialLockCheck',
        },
        {
          description: 'should retry if lock was acquired before process',
          lockConflict: 'onAcquiredLockCheck',
        },
        {
          description: 'should retry if lock was acquired after process',
          lockConflict: 'onPostProcessLockCheck',
        },
        {
          description: 'should retry if lock was acquired after persist',
          lockConflict: 'onPostPersistLockCheck',
        },
      ].forEach(({ description, lockConflict }) => {
        it(description, (done) => {
          lockScenario({
            [lockConflict]: () => ({
              currentState: { ...initialSession, lock: 'locked' },
              retryState: { ...initialSession, other: 'other' },
            }),
          })
          initialSession.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
          cookieStorage.persistSession(initialSession)
          processSpy.and.callFake((session) => ({ ...session, processed: 'processed' } as SessionState))

          processSessionStoreOperations(
            {
              process: processSpy,
              after: (afterSession) => {
                // session with 'other' value on process
                expect(processSpy).toHaveBeenCalledWith({
                  ...initialSession,
                  other: 'other',
                  lock: jasmine.any(String),
                  expire: jasmine.any(String),
                })

                // end state with session 'other' and 'processed' value
                const expectedSession = {
                  ...initialSession,
                  other: 'other',
                  processed: 'processed',
                  expire: jasmine.any(String),
                }
                expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
                expect(afterSession).toEqual(expectedSession)
                done()
              },
            },
            cookieStorage
          )
        })
      })

      it('should abort after a max number of retry', () => {
        const clock = mockClock()

        cookieStorage.persistSession(initialSession)
        cookie.setSpy.calls.reset()

        cookie.getSpy.and.returnValue(buildSessionString({ ...initialSession, lock: 'locked' }))
        processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage)

        const lockMaxTries = cookieStorage.storeAccessOptions.lockEnabled
          ? cookieStorage.storeAccessOptions.lockMaxTries
          : 0
        const lockRetryDelay = cookieStorage.storeAccessOptions.lockEnabled
          ? cookieStorage.storeAccessOptions.lockRetryDelay
          : 0

        clock.tick(lockMaxTries * lockRetryDelay)
        expect(processSpy).not.toHaveBeenCalled()
        expect(afterSpy).not.toHaveBeenCalled()
        expect(cookie.setSpy).not.toHaveBeenCalled()

        clock.cleanup()
      })

      it('should execute cookie accesses in order', (done) => {
        lockScenario({
          onInitialLockCheck: () => ({
            currentState: { ...initialSession, lock: 'locked' }, // force to retry the first access later
            retryState: initialSession,
          }),
        })
        cookieStorage.persistSession(initialSession)

        processSessionStoreOperations(
          {
            process: (session) => ({ ...session, value: 'foo' }),
            after: afterSpy,
          },
          cookieStorage
        )
        processSessionStoreOperations(
          {
            process: (session) => ({ ...session, value: `${session.value || ''}bar` }),
            after: (session) => {
              expect(session.value).toBe('foobar')
              expect(afterSpy).toHaveBeenCalled()
              done()
            },
          },
          cookieStorage
        )
      })
    })
  })
})
