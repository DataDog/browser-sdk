import type { DeflateEncoder, DeflateWorker, DeflateWorkerAction } from '@datadog/browser-core'
import { BridgeCapability, PageExitReason, display } from '@datadog/browser-core'
import type {
  RecorderApi,
  ReplayStatsHistory,
  RumConfiguration,
  RumSessionManager,
  ViewHistory,
} from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType } from '@datadog/browser-rum-core'
import { collectAsyncCalls, mockEventBridge, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumSessionManagerMock } from '../../../rum-core/test'
import {
  createRumSessionManagerMock,
  mockDocumentReadyState,
  mockRumConfiguration,
  mockViewHistory,
} from '../../../rum-core/test'
import type { CreateDeflateWorker } from '../domain/deflate'
import { MockWorker } from '../../test'
import { resetDeflateWorkerState } from '../domain/deflate'
import { makeRecorderApi } from './recorderApi'
import type { StartRecording } from './postStartStrategy'

describe('makeRecorderApi', () => {
  let lifeCycle: LifeCycle
  let replayStatsHistory: ReplayStatsHistory
  let deflateEncoder: DeflateEncoder
  let recorderApi: RecorderApi
  let startRecordingSpy: jasmine.Spy
  let loadRecorderSpy: jasmine.Spy<() => Promise<StartRecording>>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let mockWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<CreateDeflateWorker>
  let rumInit: (options?: { worker?: DeflateWorker }) => void

  function setupRecorderApi({
    sessionManager,
    startSessionReplayRecordingManually,
  }: { sessionManager?: RumSessionManager; startSessionReplayRecordingManually?: boolean } = {}) {
    mockWorker = new MockWorker()
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => mockWorker)
    spyOn(display, 'error')

    lifeCycle = new LifeCycle()
    stopRecordingSpy = jasmine.createSpy('stopRecording')
    startRecordingSpy = jasmine.createSpy('startRecording')

    // Workaround because using resolveTo(startRecordingSpy) was not working
    loadRecorderSpy = jasmine
      .createSpy('loadRecorder')
      .and.resolveTo(
        (
          lifeCycle: LifeCycle,
          configuration: RumConfiguration,
          sessionManager: RumSessionManager,
          newReplayStatsHistory: ReplayStatsHistory,
          viewHistory: ViewHistory,
          newDeflateEncoder: DeflateEncoder
        ) => {
          replayStatsHistory = newReplayStatsHistory
          deflateEncoder = newDeflateEncoder
          startRecordingSpy(
            lifeCycle,
            configuration,
            sessionManager,
            newReplayStatsHistory,
            viewHistory,
            newDeflateEncoder
          )
          return {
            stop: stopRecordingSpy,
          }
        }
      )

    recorderApi = makeRecorderApi(loadRecorderSpy, createDeflateWorkerSpy)
    rumInit = ({ worker } = {}) => {
      recorderApi.onRumStart(
        lifeCycle,
        mockRumConfiguration({ startSessionReplayRecordingManually: startSessionReplayRecordingManually ?? false }),
        sessionManager ?? createRumSessionManagerMock().setId('1234'),
        mockViewHistory(),
        worker
      )
    }

    registerCleanupTask(() => {
      resetDeflateWorkerState()
      replayStatsHistory?.stop()
    })
  }

  describe('recorder boot', () => {
    describe('with automatic start', () => {
      it('starts recording when init() is called', async () => {
        setupRecorderApi()
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumInit()
        await collectAsyncCalls(startRecordingSpy, 1)
        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('starts recording after the DOM is loaded', async () => {
        setupRecorderApi()
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()

        expect(loadRecorderSpy).toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnDomLoaded()
        await collectAsyncCalls(startRecordingSpy, 1)

        expect(startRecordingSpy).toHaveBeenCalled()
      })
    })

    describe('with manual start', () => {
      it('does not start recording when init() is called', () => {
        setupRecorderApi({ startSessionReplayRecordingManually: true })
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        rumInit()
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })

      it('does not start recording after the DOM is loaded', () => {
        setupRecorderApi({ startSessionReplayRecordingManually: true })
        const { triggerOnDomLoaded } = mockDocumentReadyState()
        rumInit()
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
        triggerOnDomLoaded()
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('recorder start', () => {
    it('ignores additional start calls while recording is already started', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()
      recorderApi.start()
      recorderApi.start()
      recorderApi.start()
      await collectAsyncCalls(startRecordingSpy, 1)

      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores restart before the DOM is loaded', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      recorderApi.stop()
      recorderApi.start()
      triggerOnDomLoaded()
      await collectAsyncCalls(startRecordingSpy, 1)

      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores start calls if the session is not tracked', () => {
      setupRecorderApi({
        sessionManager: createRumSessionManagerMock().setNotTracked(),
        startSessionReplayRecordingManually: true,
      })
      rumInit()
      recorderApi.start()

      expect(loadRecorderSpy).not.toHaveBeenCalled()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('ignores start calls if the session is tracked without session replay', () => {
      setupRecorderApi({
        sessionManager: createRumSessionManagerMock().setTrackedWithoutSessionReplay(),
        startSessionReplayRecordingManually: true,
      })
      rumInit()
      recorderApi.start()
      expect(loadRecorderSpy).not.toHaveBeenCalled()
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('should start recording if session is tracked without session replay when forced', async () => {
      const setForcedReplaySpy = jasmine.createSpy()

      setupRecorderApi({
        sessionManager: {
          ...createRumSessionManagerMock().setTrackedWithoutSessionReplay(),
          setForcedReplay: setForcedReplaySpy,
        },
        startSessionReplayRecordingManually: true,
      })

      rumInit()
      recorderApi.start({ force: true })
      await collectAsyncCalls(startRecordingSpy, 1)

      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
      expect(setForcedReplaySpy).toHaveBeenCalledTimes(1)
    })

    it('uses the previously created worker if available', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit({ worker: mockWorker })
      recorderApi.start()

      await collectAsyncCalls(startRecordingSpy, 1)
      expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording if worker creation fails', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()

      createDeflateWorkerSpy.and.throwError('Crash')
      recorderApi.start()

      expect(loadRecorderSpy).toHaveBeenCalled()
      await collectAsyncCalls(createDeflateWorkerSpy, 1)

      expect(startRecordingSpy).not.toHaveBeenCalled()
    })

    it('stops recording if worker initialization fails', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()
      recorderApi.start()
      expect(loadRecorderSpy).toHaveBeenCalled()

      await collectAsyncCalls(startRecordingSpy, 1)
      mockWorker.dispatchErrorEvent()

      expect(stopRecordingSpy).toHaveBeenCalled()
    })

    it('restarting the recording should not reset the worker action id', async () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()
      recorderApi.start()

      await collectAsyncCalls(startRecordingSpy, 1)

      deflateEncoder.write('foo')

      recorderApi.stop()
      recorderApi.start()
      await collectAsyncCalls(startRecordingSpy, 2)

      deflateEncoder.write('foo')

      const writeMessages = mockWorker.pendingMessages.filter(
        (message): message is Extract<DeflateWorkerAction, { action: 'write' }> => message.action === 'write'
      )
      expect(writeMessages.length).toBe(2)
      expect(writeMessages[0].id).toBeLessThan(writeMessages[1].id)
    })

    describe('if event bridge present', () => {
      it('should start recording when the bridge supports records', async () => {
        mockEventBridge({ capabilities: [BridgeCapability.RECORDS] })

        setupRecorderApi()
        rumInit()
        recorderApi.start()
        await collectAsyncCalls(startRecordingSpy, 1)

        expect(startRecordingSpy).toHaveBeenCalled()
      })

      it('should not start recording when the bridge does not support records', () => {
        mockEventBridge({ capabilities: [] })

        setupRecorderApi({ startSessionReplayRecordingManually: true })
        rumInit()
        recorderApi.start()

        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })

    describe('if browser is not supported', () => {
      let originalArrayFrom: (typeof Array)['from']

      beforeEach(() => {
        originalArrayFrom = Array.from
        delete (Array as any).from
      })

      afterEach(() => {
        Array.from = originalArrayFrom
      })

      it('does not start recording', () => {
        setupRecorderApi({ startSessionReplayRecordingManually: true })
        recorderApi.start()
        rumInit()
        expect(loadRecorderSpy).not.toHaveBeenCalled()
        expect(startRecordingSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('recorder stop', () => {
    it('ignores calls while recording is already stopped', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      recorderApi.stop()
      recorderApi.stop()
      recorderApi.stop()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('prevents recording to start when the DOM is loaded', async () => {
      setupRecorderApi()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()
      recorderApi.stop()
      triggerOnDomLoaded()

      await collectAsyncCalls(loadRecorderSpy, 1)

      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('recorder lifecycle', () => {
    let sessionManager: RumSessionManagerMock
    beforeEach(() => {
      sessionManager = createRumSessionManagerMock()
      setupRecorderApi({ sessionManager })
    })

    // prevent getting records after the before_unload event has been triggered.
    it('stop recording when the page unloads', async () => {
      sessionManager.setTrackedWithSessionReplay()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      expect(startRecordingSpy).toHaveBeenCalledTimes(1)

      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })
      expect(stopRecordingSpy).toHaveBeenCalled()
    })

    describe('when session renewal change the tracking type', () => {
      describe('from WITHOUT_REPLAY to WITH_REPLAY', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithoutSessionReplay()
        })

        it('starts recording if startSessionReplayRecording was called', async () => {
          rumInit()
          sessionManager.setTrackedWithSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          expect(startRecordingSpy).not.toHaveBeenCalled()
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          await collectAsyncCalls(startRecordingSpy, 1)

          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })

        it('does not starts recording if stopSessionReplayRecording was called', () => {
          rumInit()
          recorderApi.stop()
          sessionManager.setTrackedWithSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from WITHOUT_REPLAY to untracked', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithoutSessionReplay()
        })

        it('keeps not recording if startSessionReplayRecording was called', () => {
          rumInit()
          sessionManager.setNotTracked()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from WITHOUT_REPLAY to WITHOUT_REPLAY', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithoutSessionReplay()
        })

        it('keeps not recording if startSessionReplayRecording was called', () => {
          rumInit()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from WITH_REPLAY to WITHOUT_REPLAY', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithSessionReplay()
        })

        it('stops recording if startSessionReplayRecording was called', async () => {
          rumInit()
          await collectAsyncCalls(startRecordingSpy, 1)

          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          sessionManager.setTrackedWithoutSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          expect(stopRecordingSpy).toHaveBeenCalled()
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).toHaveBeenCalledTimes(1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        })

        // reassess this test
        it('prevents session recording to start if the session is renewed before the DOM is loaded', () => {
          const { triggerOnDomLoaded } = mockDocumentReadyState()
          rumInit()
          sessionManager.setTrackedWithoutSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          triggerOnDomLoaded()
          expect(loadRecorderSpy).toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from WITH_REPLAY to untracked', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithSessionReplay()
        })

        it('stops recording if startSessionReplayRecording was called', async () => {
          rumInit()
          await collectAsyncCalls(startRecordingSpy, 1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          sessionManager.setNotTracked()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          expect(stopRecordingSpy).toHaveBeenCalled()
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).toHaveBeenCalledTimes(1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
        })
      })

      describe('from WITH_REPLAY to WITH_REPLAY', () => {
        beforeEach(() => {
          sessionManager.setTrackedWithSessionReplay()
        })

        it('keeps recording if startSessionReplayRecording was called', async () => {
          rumInit()
          await collectAsyncCalls(startRecordingSpy, 1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          expect(stopRecordingSpy).toHaveBeenCalled()
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          await collectAsyncCalls(startRecordingSpy, 2)

          expect(loadRecorderSpy).toHaveBeenCalledTimes(2)
          expect(startRecordingSpy).toHaveBeenCalledTimes(2)
        })

        it('does not starts recording if stopSessionReplayRecording was called', async () => {
          rumInit()
          await collectAsyncCalls(startRecordingSpy, 1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          recorderApi.stop()
          expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).toHaveBeenCalledTimes(1)
          expect(startRecordingSpy).toHaveBeenCalledTimes(1)
          expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
        })
      })

      describe('from untracked to REPLAY', () => {
        beforeEach(() => {
          sessionManager.setNotTracked()
        })

        it('starts recording if startSessionReplayRecording was called', async () => {
          rumInit()
          sessionManager.setTrackedWithSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          await collectAsyncCalls(startRecordingSpy, 1)

          expect(startRecordingSpy).toHaveBeenCalled()

          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })

        it('does not starts recording if stopSessionReplayRecording was called', () => {
          rumInit()
          recorderApi.stop()
          sessionManager.setTrackedWithSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from untracked to WITHOUT_REPLAY', () => {
        beforeEach(() => {
          sessionManager.setNotTracked()
        })

        it('keeps not recording if startSessionReplayRecording was called', () => {
          rumInit()
          sessionManager.setTrackedWithoutSessionReplay()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })
      })

      describe('from untracked to untracked', () => {
        beforeEach(() => {
          sessionManager.setNotTracked()
        })

        it('keeps not recording if startSessionReplayRecording was called', () => {
          rumInit()
          lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
          lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
          expect(loadRecorderSpy).not.toHaveBeenCalled()
          expect(startRecordingSpy).not.toHaveBeenCalled()
          expect(stopRecordingSpy).not.toHaveBeenCalled()
        })
      })
    })
  })

  describe('isRecording', () => {
    it('is false when recording has not been started', () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()

      mockWorker.processAllMessages()

      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is false when the worker is not yet initialized', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is false when the worker failed to initialize', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      mockWorker.dispatchErrorEvent()

      expect(recorderApi.isRecording()).toBeFalse()
    })

    it('is true when recording is started and the worker is initialized', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      mockWorker.processAllMessages()

      expect(recorderApi.isRecording()).toBeTrue()
    })

    it('is false before the DOM is loaded', async () => {
      setupRecorderApi()
      const { triggerOnDomLoaded } = mockDocumentReadyState()
      rumInit()

      recorderApi.start()

      mockWorker.processAllMessages()

      expect(recorderApi.isRecording()).toBeFalse()

      triggerOnDomLoaded()
      await collectAsyncCalls(startRecordingSpy, 1)

      mockWorker.processAllMessages()

      expect(recorderApi.isRecording()).toBeTrue()
    })
  })

  describe('getReplayStats', () => {
    const VIEW_ID = 'xxx'

    it('is undefined when recording has not been started', () => {
      setupRecorderApi({ startSessionReplayRecordingManually: true })
      rumInit()

      replayStatsHistory?.addSegment(VIEW_ID)
      mockWorker.processAllMessages()

      expect(recorderApi.getReplayStats(VIEW_ID)).toBeUndefined()
    })

    it('is undefined when the worker is not yet initialized', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      replayStatsHistory?.addSegment(VIEW_ID)
      expect(recorderApi.getReplayStats(VIEW_ID)).toBeUndefined()
    })

    it('is undefined when the worker failed to initialize', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      replayStatsHistory?.addSegment(VIEW_ID)
      mockWorker.dispatchErrorEvent()

      expect(recorderApi.getReplayStats(VIEW_ID)).toBeUndefined()
    })

    it('is defined when recording is started and the worker is initialized', async () => {
      setupRecorderApi()
      rumInit()
      await collectAsyncCalls(startRecordingSpy, 1)

      replayStatsHistory.addSegment(VIEW_ID)
      mockWorker.processAllMessages()

      expect(recorderApi.getReplayStats(VIEW_ID)).toEqual({
        records_count: 0,
        segments_count: 1,
        segments_total_raw_size: 0,
      })
    })
  })
})
