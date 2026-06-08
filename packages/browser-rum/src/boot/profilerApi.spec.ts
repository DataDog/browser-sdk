import { BridgeCapability, createIdentityEncoder } from '@datadog/browser-core'
import {
  MID_HASH_UUID,
  replaceMockable,
  mockEventBridge,
  replaceMockableWithSpy,
  createSessionManagerMock,
  waitNextMicrotask,
} from '@datadog/browser-core/test'
import { createHooks, LifeCycle } from '@datadog/browser-rum-core'
import { mockRumConfiguration, mockViewHistory } from '@datadog/browser-rum-core/test'
import { isProfilingSupported } from '../domain/profiling/profilingSupported'
import { makeProfilerApi } from './profilerApi'
import { lazyLoadProfiler } from './lazyLoadProfiler'

describe('profilerApi', () => {
  describe('deterministic sampling', () => {
    it('should apply the correction factor for chained sampling on the profiling sample rate', () => {
      // MID_HASH_UUID has a hash of ~50.7%. With sessionSampleRate=60 and profilingSampleRate=60:
      // - Without correction: isSampled(id, 60) → true (50.7 < 60)
      // - With correction: isSampled(id, 60*60/100=36) → false (50.7 > 36)
      const isProfilingSupportedSpy = replaceMockableWithSpy(isProfilingSupported)
      const profilerApi = makeProfilerApi()

      profilerApi.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        mockViewHistory(),
        createIdentityEncoder
      )

      expect(isProfilingSupportedSpy).not.toHaveBeenCalled()
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy

    beforeEach(() => {
      createRumProfilerSpy = jasmine
        .createSpy('createRumProfiler')
        .and.returnValue({ start: jasmine.createSpy(), stop: jasmine.createSpy() })
      replaceMockable(isProfilingSupported, () => true)
      replaceMockable(lazyLoadProfiler, () => Promise.resolve(createRumProfilerSpy))
    })

    async function startApi() {
      const api = makeProfilerApi()
      api.onRumStart(
        new LifeCycle(),
        createHooks(),
        mockRumConfiguration({ profilingSampleRate: 100 }),
        createSessionManagerMock().setId('session-id-1'),
        mockViewHistory(),
        createIdentityEncoder
      )
      await waitNextMicrotask() // let lazyLoadProfiler().then() run
      return api
    }

    describe('when bridge is present without PROFILES capability', () => {
      it('does not start the profiler', async () => {
        mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })
        await startApi()
        expect(createRumProfilerSpy).not.toHaveBeenCalled()
      })
    })

    describe('when bridge is present with PROFILES capability', () => {
      it('starts the profiler with an emitPayload function', async () => {
        mockEventBridge({ capabilities: [BridgeCapability.RECORDS, BridgeCapability.PROFILES] })
        await startApi()
        expect(createRumProfilerSpy).toHaveBeenCalled()
        expect(typeof createRumProfilerSpy.calls.first().args[4]).toBe('function')
      })
    })

    describe('when no bridge', () => {
      it('starts the profiler with an emitPayload function', async () => {
        await startApi()
        expect(createRumProfilerSpy).toHaveBeenCalled()
        expect(typeof createRumProfilerSpy.calls.first().args[4]).toBe('function')
      })
    })
  })
})
