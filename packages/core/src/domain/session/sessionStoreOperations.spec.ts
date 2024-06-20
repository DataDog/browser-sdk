import type { MockStorage } from '../../../test'
import { mockClock, mockCookieProvider, mockLocalStorageProvider } from '../../../test'
import type { CookieOptions } from '../../browser/cookie'
import { initCookieStrategy } from './storeStrategies/sessionInCookie'
import { initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import type { SessionState } from './sessionState'
import { expandSessionState, toSessionString } from './sessionState'
import { processSessionStoreOperations, LOCK_MAX_TRIES, LOCK_RETRY_DELAY } from './sessionStoreOperations'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'

const cookieOptions: CookieOptions = {}
const EXPIRED_SESSION: SessionState = { isExpired: '1' }

;(
  [
    {
      title: 'Cookie Storage',
      createSessionStoreStrategy: () => initCookieStrategy(cookieOptions),
      storageProvider: mockCookieProvider,
      storageKey: SESSION_STORE_KEY,
    },
    {
      title: 'Local Storage',
      createSessionStoreStrategy: () => initLocalStorageStrategy(),
      storageProvider: mockLocalStorageProvider,
      storageKey: SESSION_STORE_KEY,
    },
  ] as const
).forEach(({ title, createSessionStoreStrategy, storageProvider, storageKey }) => {
  describe(`process operations mechanism with ${title}`, () => {
    const sessionStoreStrategy = createSessionStoreStrategy()
    let initialSession: SessionState
    let otherSession: SessionState
    let processSpy: jasmine.Spy<jasmine.Func>
    let afterSpy: jasmine.Spy<jasmine.Func>
    let storage: MockStorage
    const now = Date.now()

    beforeEach(() => {
      sessionStoreStrategy.expireSession()
      initialSession = { id: '123', created: String(now) }
      otherSession = { id: '456', created: String(now + 100) }
      processSpy = jasmine.createSpy('process')
      afterSpy = jasmine.createSpy('after')
      storage = storageProvider.get()
    })

    describe('with lock access disabled', () => {
      beforeEach(() => {
        sessionStoreStrategy.isLockEnabled && pending('lock-access required')
      })

      it('should persist session when process returns a value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process returns an expired session', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(EXPIRED_SESSION)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        expect(sessionStoreStrategy.retrieveSession()).toEqual(EXPIRED_SESSION)
        expect(afterSpy).toHaveBeenCalledWith(EXPIRED_SESSION)
      })

      it('should not persist session when process returns undefined', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
        expect(afterSpy).toHaveBeenCalledWith(initialSession)
      })

      it('LOCK_MAX_TRIES value should not influence the behavior when lock mechanism is not enabled', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy, LOCK_MAX_TRIES)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })
    })

    describe('with lock access enabled', () => {
      beforeEach(() => {
        !sessionStoreStrategy.isLockEnabled && pending('lock-access not enabled')
      })

      it('should persist session when process returns a value', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue({ ...otherSession })

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        const expectedSession = { ...otherSession, expire: jasmine.any(String) }
        expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
        expect(afterSpy).toHaveBeenCalledWith(expectedSession)
      })

      it('should clear session when process returns an expired session', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(EXPIRED_SESSION)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)

        expect(sessionStoreStrategy.retrieveSession()).toEqual(EXPIRED_SESSION)
        expect(afterSpy).toHaveBeenCalledWith(EXPIRED_SESSION)
      })

      it('should not persist session when process returns undefined', () => {
        sessionStoreStrategy.persistSession(initialSession)
        processSpy.and.returnValue(undefined)

        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        expect(processSpy).toHaveBeenCalledWith(initialSession)
        expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
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
        storage.getSpy.and.callFake(() => {
          const currentOnLockCheck = onLockChecks.shift()
          if (!currentOnLockCheck) {
            return storage.currentValue(storageKey)
          }
          const { currentState, retryState } = currentOnLockCheck()
          storage.setCurrentValue(storageKey, toSessionString(retryState))
          return buildSessionString(currentState)
        })
      }

      function buildSessionString(currentState: SessionState) {
        return `${storageKey}=${toSessionString(currentState)}`
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
          expandSessionState(initialSession)
          sessionStoreStrategy.persistSession(initialSession)
          processSpy.and.callFake((session) => ({ ...session, processed: 'processed' }) as SessionState)

          processSessionStoreOperations(
            {
              process: processSpy,
              after: (afterSession) => {
                // session with 'other' value on process
                expect(processSpy).toHaveBeenCalledWith({
                  ...initialSession,
                  other: 'other',
                  expire: jasmine.any(String),
                })

                // end state with session 'other' and 'processed' value
                const expectedSession = {
                  ...initialSession,
                  other: 'other',
                  processed: 'processed',
                  expire: jasmine.any(String),
                }
                expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
                expect(afterSession).toEqual(expectedSession)
                done()
              },
            },
            sessionStoreStrategy
          )
        })
      })

      it('should abort after a max number of retry', () => {
        const clock = mockClock()

        sessionStoreStrategy.persistSession(initialSession)
        storage.setSpy.calls.reset()

        storage.getSpy.and.returnValue(buildSessionString({ ...initialSession, lock: 'locked' }))
        processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

        const lockMaxTries = sessionStoreStrategy.isLockEnabled ? LOCK_MAX_TRIES : 0
        const lockRetryDelay = sessionStoreStrategy.isLockEnabled ? LOCK_RETRY_DELAY : 0

        clock.tick(lockMaxTries * lockRetryDelay)
        expect(processSpy).not.toHaveBeenCalled()
        expect(afterSpy).not.toHaveBeenCalled()
        expect(storage.setSpy).not.toHaveBeenCalled()

        clock.cleanup()
      })

      it('should execute cookie accesses in order', (done) => {
        lockScenario({
          onInitialLockCheck: () => ({
            currentState: { ...initialSession, lock: 'locked' }, // force to retry the first access later
            retryState: initialSession,
          }),
        })
        sessionStoreStrategy.persistSession(initialSession)

        processSessionStoreOperations(
          {
            process: (session) => ({ ...session, value: 'foo' }),
            after: afterSpy,
          },
          sessionStoreStrategy
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
          sessionStoreStrategy
        )
      })
    })
  })
})
