import { stubCookie, mockClock } from '../../../test'
import { isChromium } from '../../tools/utils/browserDetection'
import { SESSION_EXPIRATION_DELAY } from './sessionConstants'
import { initCookieStore, SESSION_COOKIE_NAME } from './sessionCookieStore'
import type { SessionState, SessionStore } from './sessionStore'
import { toSessionString } from './sessionStore'
import {
  processSessionStoreOperations,
  isLockEnabled,
  LOCK_MAX_TRIES,
  LOCK_RETRY_DELAY,
} from './sessionStoreOperations'

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

    it('LOCK_MAX_TRIES value should not influence the behavior when lock mechanism is not enabled', () => {
      cookieStorage.persistSession(initialSession)
      processSpy.and.returnValue({ ...otherSession })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, cookieStorage, LOCK_MAX_TRIES)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(cookieStorage.retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
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

      const lockMaxTries = isLockEnabled() ? LOCK_MAX_TRIES : 0
      const lockRetryDelay = isLockEnabled() ? LOCK_RETRY_DELAY : 0

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
