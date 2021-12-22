import { stubCookie } from '../../../test/specHelper'
import { resetExperimentalFeatures, updateExperimentalFeatures } from '../configuration/experimentalFeatures'
import { startFakeInternalMonitoring, resetInternalMonitoring } from '../internalMonitoring'
import {
  SESSION_COOKIE_NAME,
  toSessionString,
  retrieveSession,
  persistSession,
  MAX_NUMBER_OF_LOCK_RETRIES,
  LOCK_RETRY_DELAY,
  withCookieLockAccess,
} from './sessionCookieStore'
import { SessionState } from './sessionStore'

describe('session cookie store', () => {
  const COOKIE_OPTIONS = {}
  let initialSession: SessionState
  let otherSession: SessionState
  let processSpy: jasmine.Spy<jasmine.Func>
  let afterSpy: jasmine.Spy<jasmine.Func>
  let cookie: ReturnType<typeof stubCookie>

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
    let currentSession: string
    cookie.setSpy.and.callFake((session) => {
      currentSession = session
    })

    cookie.getSpy.and.callFake(() => {
      const currentOnLockCheck = onLockChecks.shift()
      if (!currentOnLockCheck) {
        return currentSession
      }
      cookie.getSpy.and.callThrough()
      cookie.setSpy.and.callThrough()
      const { currentState, retryState } = currentOnLockCheck()
      persistSession(retryState, COOKIE_OPTIONS)
      return buildSessionString(currentState)
    })
  }

  function buildSessionString(currentState: SessionState) {
    return `${SESSION_COOKIE_NAME}=${toSessionString(currentState)}`
  }

  beforeEach(() => {
    initialSession = { id: '123', created: '0' }
    otherSession = { id: '456', created: '100' }
    processSpy = jasmine.createSpy('process')
    afterSpy = jasmine.createSpy('after')
    cookie = stubCookie()
  })

  afterEach(() => {
    cookie.stop()
  })

  describe('with cookie-lock disabled', () => {
    it('should persist session when process return a value', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.returnValue({ ...otherSession })

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should clear session when process return an empty value', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.returnValue({})

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = {}
      expect(retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should not persist session when process return undefined', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.returnValue(undefined)

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(retrieveSession()).toEqual(initialSession)
      expect(afterSpy).toHaveBeenCalledWith(initialSession)
    })
  })

  describe('with cookie-lock enabled', () => {
    beforeEach(() => {
      updateExperimentalFeatures(['cookie-lock'])
    })

    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should persist session when process return a value', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.callFake((session) => ({ ...otherSession, lock: session.lock }))

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should clear session when process return an empty value', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.returnValue({})

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
      const expectedSession = {}
      expect(retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should not persist session when process return undefined', () => {
      persistSession(initialSession, COOKIE_OPTIONS)
      processSpy.and.returnValue(undefined)

      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      expect(processSpy).toHaveBeenCalledWith({ ...initialSession, lock: jasmine.any(String) })
      expect(retrieveSession()).toEqual(initialSession)
      expect(afterSpy).toHaveBeenCalledWith(initialSession)
    })
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
        persistSession(initialSession, COOKIE_OPTIONS)
        processSpy.and.callFake((session) => ({ ...session, processed: 'processed' } as SessionState))

        withCookieLockAccess({
          options: COOKIE_OPTIONS,
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
            expect(retrieveSession()).toEqual(expectedSession)
            expect(afterSession).toEqual(expectedSession)
            done()
          },
        })
      })
    })

    it('should abort after a max number of retry', (done) => {
      const maxNumberOfRetriesShouldBeReached = MAX_NUMBER_OF_LOCK_RETRIES * LOCK_RETRY_DELAY * 2
      const monitoringMessages = startFakeInternalMonitoring()
      persistSession(initialSession, COOKIE_OPTIONS)
      cookie.setSpy.calls.reset()

      cookie.getSpy.and.returnValue(buildSessionString({ ...initialSession, lock: 'locked' }))
      withCookieLockAccess({ options: COOKIE_OPTIONS, process: processSpy, after: afterSpy })

      setTimeout(() => {
        expect(processSpy).not.toHaveBeenCalled()
        expect(afterSpy).not.toHaveBeenCalled()
        expect(cookie.setSpy).not.toHaveBeenCalled()
        expect(monitoringMessages.length).toBe(1)
        resetInternalMonitoring()
        done()
      }, maxNumberOfRetriesShouldBeReached)
    })

    it('should execute cookie accesses in order', (done) => {
      lockScenario({
        onInitialLockCheck: () => ({
          currentState: { ...initialSession, lock: 'locked' }, // force to postpone first access
          retryState: initialSession,
        }),
      })
      persistSession(initialSession, COOKIE_OPTIONS)

      withCookieLockAccess({
        options: COOKIE_OPTIONS,
        process: (session) => ({ ...session, first: 'added' }),
        after: afterSpy,
      })
      withCookieLockAccess({
        options: COOKIE_OPTIONS,
        process: (session) => ({ ...session, second: 'added' }),
        after: (session) => {
          expect(session.first).toBe('added')
          expect(session.second).toBe('added')
          expect(afterSpy).toHaveBeenCalled()
          done()
        },
      })
    })
  })
})
