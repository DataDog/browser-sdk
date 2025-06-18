import { mockClock } from '../../../test'
import type { Configuration } from '../configuration'
import type { SessionState } from './sessionState'
import { expandSessionState, getExpiredSessionState } from './sessionState'
import {
  processSessionStoreOperations,
  LOCK_MAX_TRIES,
  LOCK_RETRY_DELAY,
  createLock,
  LOCK_EXPIRATION_DELAY,
} from './sessionStoreOperations'

const EXPIRED_SESSION: SessionState = { isExpired: '1', anonymousId: '0' }

describe('sessionStoreOperations', () => {
  let initialSession: SessionState
  let otherSession: SessionState
  let processSpy: jasmine.Spy<jasmine.Func>
  let afterSpy: jasmine.Spy<jasmine.Func>
  const now = Date.now()

  beforeEach(() => {
    initialSession = { id: '123', created: String(now) }
    otherSession = { id: '456', created: String(now + 100) }
    processSpy = jasmine.createSpy('process')
    afterSpy = jasmine.createSpy('after')
  })

  describe('with lock access disabled', () => {
    it('should persist session when process returns a value', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: false, initialSession })
      processSpy.and.returnValue({ ...otherSession })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should clear session when process returns an expired session', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: false, initialSession })
      processSpy.and.returnValue(EXPIRED_SESSION)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(sessionStoreStrategy.retrieveSession()).toEqual(EXPIRED_SESSION)
      expect(afterSpy).toHaveBeenCalledWith(EXPIRED_SESSION)
    })

    it('should not persist session when process returns undefined', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: false, initialSession })
      processSpy.and.returnValue(undefined)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
      expect(afterSpy).toHaveBeenCalledWith(initialSession)
    })

    it('LOCK_MAX_TRIES value should not influence the behavior when lock mechanism is not enabled', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: false, initialSession })
      processSpy.and.returnValue({ ...otherSession })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy, LOCK_MAX_TRIES)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })
  })

  describe('with lock access enabled', () => {
    it('should persist session when process returns a value', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue({ ...otherSession })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should clear session when process returns an expired session', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue(EXPIRED_SESSION)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)

      expect(sessionStoreStrategy.retrieveSession()).toEqual(EXPIRED_SESSION)
      expect(afterSpy).toHaveBeenCalledWith(EXPIRED_SESSION)
    })

    it('should not persist session when process returns undefined', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue(undefined)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
      expect(afterSpy).toHaveBeenCalledWith(initialSession)
    })
    ;[
      {
        description: 'should wait for lock to be free',
        lockConflictOnRetrievedSessionIndex: 0,
      },
      {
        description: 'should retry if lock was acquired before process',
        lockConflictOnRetrievedSessionIndex: 1,
      },
      {
        description: 'should retry if lock was acquired after process',
        lockConflictOnRetrievedSessionIndex: 2,
      },
      {
        description: 'should retry if lock was acquired after persist',
        lockConflictOnRetrievedSessionIndex: 3,
      },
    ].forEach(({ description, lockConflictOnRetrievedSessionIndex }) => {
      it(description, (done) => {
        expandSessionState(initialSession)
        const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
        sessionStoreStrategy.planRetrieveSession(lockConflictOnRetrievedSessionIndex, {
          ...initialSession,
          lock: createLock(),
        })
        sessionStoreStrategy.planRetrieveSession(lockConflictOnRetrievedSessionIndex + 1, {
          ...initialSession,
          other: 'other',
        })
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

      const sessionStoreStrategy = createFakeSessionStoreStrategy({
        isLockEnabled: true,
        initialSession: { ...initialSession, lock: createLock() },
      })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      clock.tick(LOCK_MAX_TRIES * LOCK_RETRY_DELAY)
      expect(processSpy).not.toHaveBeenCalled()
      expect(afterSpy).not.toHaveBeenCalled()
      expect(sessionStoreStrategy.persistSession).not.toHaveBeenCalled()
    })

    it('should execute cookie accesses in order', (done) => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({
        isLockEnabled: true,
        initialSession: { ...initialSession, lock: createLock() },
      })
      sessionStoreStrategy.planRetrieveSession(1, initialSession)

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

    it('ignores locks set by an older version of the SDK (without creation date)', () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({
        isLockEnabled: true,
        initialSession: { ...initialSession, lock: 'locked' },
      })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)
      expect(processSpy).toHaveBeenCalled()
    })

    it('ignores expired locks', () => {
      const clock = mockClock()
      const sessionStoreStrategy = createFakeSessionStoreStrategy({
        isLockEnabled: true,
        initialSession: { ...initialSession, lock: createLock() },
      })
      clock.tick(LOCK_EXPIRATION_DELAY + 1)
      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)
      expect(processSpy).toHaveBeenCalled()
    })
  })
})

function createFakeSessionStoreStrategy({
  isLockEnabled = false,
  initialSession = {},
}: { isLockEnabled?: boolean; initialSession?: SessionState } = {}) {
  let session: SessionState = initialSession
  const plannedRetrieveSessions: SessionState[] = []

  return {
    isLockEnabled,

    persistSession: jasmine.createSpy('persistSession').and.callFake((newSession) => {
      session = newSession
    }),

    retrieveSession: jasmine.createSpy('retrieveSession').and.callFake(() => {
      const plannedSession = plannedRetrieveSessions.shift()
      if (plannedSession) {
        session = plannedSession
      }
      return { ...session }
    }),

    expireSession: jasmine.createSpy('expireSession').and.callFake((previousSession) => {
      session = getExpiredSessionState(previousSession, { trackAnonymousUser: true } as Configuration)
    }),

    planRetrieveSession: (index: number, fakeSession: SessionState) => {
      plannedRetrieveSessions[index] = fakeSession
    },
  }
}
