import { registerCleanupTask } from '../../../../test'
import { getGlobalObject } from '../../../tools/globalObject'
import type { SessionState } from '../sessionState'
import { initMemorySessionStoreStrategy, MEMORY_SESSION_STORE_KEY } from './sessionInMemory'

describe('Memory SessionStoreStrategy', () => {
  let strategy: ReturnType<typeof initMemorySessionStoreStrategy>

  beforeEach(() => {
    const globalObject = getGlobalObject<Record<string, unknown>>()
    delete globalObject[MEMORY_SESSION_STORE_KEY]
    strategy = initMemorySessionStoreStrategy()
    registerCleanupTask(() => {
      delete globalObject[MEMORY_SESSION_STORE_KEY]
    })
  })

  describe('setSessionState', () => {
    it('should read current state, apply fn, and write back', () => {
      void strategy.setSessionState((state) => ({ ...state, id: 'test-id' }))

      const globalObject = getGlobalObject<Record<string, { state?: SessionState }>>()
      expect(globalObject[MEMORY_SESSION_STORE_KEY]?.state?.id).toBe('test-id')
    })

    it('should start with empty state when no session exists', () => {
      void strategy.setSessionState((state) => {
        expect(state).toEqual({})
        return { ...state, id: 'new-id' }
      })
    })

    it('should notify sessionObservable after write', async () => {
      const spy = jasmine.createSpy('observer')
      strategy.sessionObservable.subscribe(spy)

      await strategy.setSessionState((state) => ({ ...state, id: 'test-id' }))

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'test-id' }))
    })
  })

  describe('sessionObservable', () => {
    it('should be shared across strategy instances', async () => {
      const strategy2 = initMemorySessionStoreStrategy()
      const spy = jasmine.createSpy('observer')

      strategy.sessionObservable.subscribe(spy)
      await strategy2.setSessionState((state) => ({ ...state, id: 'from-strategy2' }))

      expect(spy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 'from-strategy2' }))
    })
  })

  describe('isolation', () => {
    it('should shallow clone on read to prevent external mutation', () => {
      void strategy.setSessionState(() => ({ id: 'original' }))

      let capturedState: SessionState | undefined
      void strategy.setSessionState((state) => {
        capturedState = state
        return state
      })

      capturedState!.id = 'mutated'

      void strategy.setSessionState((state) => {
        expect(state.id).toBe('original')
        return state
      })
    })
  })
})
