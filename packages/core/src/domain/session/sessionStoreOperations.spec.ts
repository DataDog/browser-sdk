import { createFakeSessionStoreStrategy } from '../../../test'
import type { SessionState } from './sessionState'
import { processSessionStoreOperations, resetSessionStoreOperations } from './sessionStoreOperations'

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
    resetSessionStoreOperations()
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
  })

  describe('with lock access enabled (Web Locks API)', () => {
    // Helper to wait for the after callback to be called
    function waitForAfterCallback(spy: jasmine.Spy, timeout = 100): Promise<void> {
      return new Promise((resolve, reject) => {
        const startTime = Date.now()
        const checkInterval = setInterval(() => {
          if (spy.calls.count() > 0) {
            clearInterval(checkInterval)
            resolve()
          } else if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval)
            reject(new Error('Timeout waiting for callback'))
          }
        }, 5)
      })
    }

    it('should persist session when process returns a value', async () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue({ ...otherSession })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      await waitForAfterCallback(afterSpy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      const expectedSession = { ...otherSession, expire: jasmine.any(String) }
      expect(sessionStoreStrategy.retrieveSession()).toEqual(expectedSession)
      expect(afterSpy).toHaveBeenCalledWith(expectedSession)
    })

    it('should clear session when process returns an expired session', async () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue(EXPIRED_SESSION)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      await waitForAfterCallback(afterSpy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(sessionStoreStrategy.retrieveSession()).toEqual(EXPIRED_SESSION)
      expect(afterSpy).toHaveBeenCalledWith(EXPIRED_SESSION)
    })

    it('should not persist session when process returns undefined', async () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })
      processSpy.and.returnValue(undefined)

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      await waitForAfterCallback(afterSpy)

      expect(processSpy).toHaveBeenCalledWith(initialSession)
      expect(sessionStoreStrategy.retrieveSession()).toEqual(initialSession)
      expect(afterSpy).toHaveBeenCalledWith(initialSession)
    })

    it('should execute operations in order', async () => {
      const sessionStoreStrategy = createFakeSessionStoreStrategy({ isLockEnabled: true, initialSession })

      const secondAfterSpy = jasmine.createSpy('secondAfter')

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
          after: secondAfterSpy,
        },
        sessionStoreStrategy
      )

      await waitForAfterCallback(secondAfterSpy)

      const finalSession = sessionStoreStrategy.retrieveSession()
      expect(finalSession.value).toBe('foobar')
      expect(afterSpy).toHaveBeenCalled()
    })

    it('should strip lock field from session for backwards compatibility', async () => {
      const sessionWithLock = { ...initialSession, lock: 'some-lock-value' }
      const sessionStoreStrategy = createFakeSessionStoreStrategy({
        isLockEnabled: true,
        initialSession: sessionWithLock,
      })

      processSessionStoreOperations({ process: processSpy, after: afterSpy }, sessionStoreStrategy)

      await waitForAfterCallback(afterSpy)

      // Verify the lock field was stripped before passing to process
      expect(processSpy).toHaveBeenCalledWith(initialSession)
    })
  })
})
