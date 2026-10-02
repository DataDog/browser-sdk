import { vi, beforeEach, describe, expect, it } from 'vitest'
import { globalObject } from '@datadog/js-core/util'
import { registerCleanupTask } from '../../../../test'
import type { SessionState } from '../sessionState'
import type { GlobalObjectWithSession } from './sessionInMemory'
import { initMemorySessionStoreStrategy, MEMORY_SESSION_STORE_KEY } from './sessionInMemory'

describe('Memory SessionStoreStrategy', () => {
  let strategy: ReturnType<typeof initMemorySessionStoreStrategy>

  beforeEach(() => {
    const globalObjectWithSession = globalObject as GlobalObjectWithSession
    delete globalObjectWithSession[MEMORY_SESSION_STORE_KEY]
    strategy = initMemorySessionStoreStrategy()
    registerCleanupTask(() => {
      delete globalObjectWithSession[MEMORY_SESSION_STORE_KEY]
    })
  })

  describe('setSessionState', () => {
    it('should read current state, apply fn, and write back', () => {
      void strategy.setSessionState((state) => ({ ...state, id: 'test-id' }), 'updateState')

      const globalObjectWithSession = globalObject as GlobalObjectWithSession
      expect(globalObjectWithSession[MEMORY_SESSION_STORE_KEY]?.state?.id).toBe('test-id')
    })

    it('should start with empty state when no session exists', () => {
      void strategy.setSessionState((state) => {
        expect(state).toEqual({})
        return { ...state, id: 'new-id' }
      }, 'updateState')
    })

    it('should notify sessionObservable after write', async () => {
      const spy = vi.fn()
      strategy.sessionObservable.subscribe(spy)

      await strategy.setSessionState((state) => ({ ...state, id: 'test-id' }), 'updateState')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-id' }))
    })
  })

  describe('sessionObservable', () => {
    it('should be shared across strategy instances', async () => {
      const strategy2 = initMemorySessionStoreStrategy()
      const spy = vi.fn()

      strategy.sessionObservable.subscribe(spy)
      await strategy2.setSessionState((state) => ({ ...state, id: 'from-strategy2' }), 'updateState')

      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ id: 'from-strategy2' }))
    })
  })

  describe('isolation', () => {
    it('should shallow clone on read to prevent external mutation', () => {
      void strategy.setSessionState(() => ({ id: 'original' }), 'updateState')

      let capturedState: SessionState | undefined
      void strategy.setSessionState((state) => {
        capturedState = state
        return state
      }, 'updateState')

      capturedState!.id = 'mutated'

      void strategy.setSessionState((state) => {
        expect(state.id).toBe('original')
        return state
      }, 'updateState')
    })
  })
})
