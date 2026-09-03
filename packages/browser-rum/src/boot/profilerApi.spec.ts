import {
  MID_HASH_UUID,
  replaceMockableWithSpy,
  createSessionManagerMock,
  replaceMockable,
  waitNextMicrotask,
  mockEventBridge,
} from '@datadog/browser-core/test'
import { mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { createRumInternalApi } from '@datadog/browser-rum-core'
import { BridgeCapability, createIdentityEncoder } from '@datadog/browser-core'
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
        createRumInternalApi({ sessionManager: createSessionManagerMock() }),
        mockRumConfiguration({ sessionSampleRate: 60, profilingSampleRate: 60 }),
        createSessionManagerMock().setId(MID_HASH_UUID),
        createIdentityEncoder
      )

      expect(isProfilingSupportedSpy).not.toHaveBeenCalled()
    })
  })

  describe('bridge mode', () => {
    let createRumProfilerSpy: jasmine.Spy
    let profilerInstance: { start: jasmine.Spy; stop: jasmine.Spy }

    beforeEach(() => {
      profilerInstance = { start: jasmine.createSpy(), stop: jasmine.createSpy() }
      createRumProfilerSpy = jasmine.createSpy('createRumProfiler').and.returnValue(profilerInstance)
      replaceMockable(isProfilingSupported, () => true)
      replaceMockable(lazyLoadProfiler, () => Promise.resolve(createRumProfilerSpy))
    })

    async function startApi() {
      const api = makeProfilerApi()
      api.onRumStart(
        createRumInternalApi({ sessionManager: createSessionManagerMock() }),
        mockRumConfiguration({ profilingSampleRate: 100 }),
        createSessionManagerMock().setId('session-id-1'),
        createIdentityEncoder
      )
      await waitNextMicrotask() // let lazyLoadProfiler().then() run
      return api
    }

    it('should not start the profiler if the bridge does not support profiling', async () => {
      mockEventBridge({ capabilities: [] })
      await startApi()
      expect(createRumProfilerSpy).not.toHaveBeenCalled()
    })

    it('should start the profiler if the bridge supports profiling', async () => {
      mockEventBridge({ capabilities: [BridgeCapability.PROFILES] })

      const api = await startApi()

      expect(createRumProfilerSpy).toHaveBeenCalled()
      // The profiler receives the internal API first ...
      expect((createRumProfilerSpy.calls.argsFor(0)[0] as { notifications: unknown }).notifications).toBeDefined()
      // ...followed by the configuration, session manager, profiling context manager and encoder
      expect(createRumProfilerSpy.calls.argsFor(0)[1]).toBeDefined()
      expect(createRumProfilerSpy.calls.argsFor(0)[2]).toBeDefined()
      expect((createRumProfilerSpy.calls.argsFor(0)[3] as { set: unknown }).set).toBeDefined()
      expect(createRumProfilerSpy.calls.argsFor(0)[4]).toBe(createIdentityEncoder)

      api.stop()
      expect(profilerInstance.stop).toHaveBeenCalled()
    })
  })
})
