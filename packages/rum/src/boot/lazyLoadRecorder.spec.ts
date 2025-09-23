import { type DeflateWorker, type RawTelemetryEvent, type Telemetry, display } from '@datadog/browser-core'
import type { RecorderApi, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycle } from '@datadog/browser-rum-core'
import type { MockTelemetry } from '@datadog/browser-core/test'
import { registerCleanupTask, startMockTelemetry, wait } from '@datadog/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration, mockViewHistory } from '../../../rum-core/test'
import type { CreateDeflateWorker } from '../domain/deflate'
import { resetDeflateWorkerState } from '../domain/deflate'
import { MockWorker } from '../../test'
import * as replayStats from '../domain/replayStats'
import { makeRecorderApi } from './recorderApi'
import type { StartRecording } from './postStartStrategy'
import { lazyLoadRecorder } from './lazyLoadRecorder'

const RECORDER_INIT_TELEMETRY: RawTelemetryEvent = {
  type: 'log',
  status: 'debug',
  message: 'Recorder init metrics',
  metrics: {
    forced: false,
    loadRecorderModuleDuration: jasmine.any(Number),
    recorderInitDuration: jasmine.any(Number),
    result: 'recorder-load-failed',
    waitForDocReadyDuration: jasmine.any(Number),
  },
}

describe('lazyLoadRecorder', () => {
  let displaySpy: jasmine.Spy
  let telemetry: MockTelemetry
  let lifeCycle: LifeCycle
  let recorderApi: RecorderApi
  let startRecordingSpy: jasmine.Spy
  let loadRecorderSpy: jasmine.Spy<() => Promise<StartRecording>>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let mockWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy<CreateDeflateWorker>
  let rumInit: (options?: { worker?: DeflateWorker }) => void

  function setupRecorderApi({
    loadRecorderError,
    sessionManager,
    startSessionReplayRecordingManually,
  }: {
    loadRecorderError?: Error
    sessionManager?: RumSessionManager
    startSessionReplayRecordingManually?: boolean
  } = {}) {
    telemetry = startMockTelemetry()
    mockWorker = new MockWorker()
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => mockWorker)
    displaySpy = spyOn(display, 'error')

    lifeCycle = new LifeCycle()
    stopRecordingSpy = jasmine.createSpy('stopRecording')
    startRecordingSpy = jasmine.createSpy('startRecording')

    loadRecorderSpy = jasmine.createSpy('loadRecorder').and.callFake((...args) => {
      if (loadRecorderError) {
        return lazyLoadRecorder(() => Promise.reject(loadRecorderError))
      }
      startRecordingSpy(...args)
      return Promise.resolve({
        stop: stopRecordingSpy,
      })
    })

    const configuration = mockRumConfiguration({
      startSessionReplayRecordingManually: startSessionReplayRecordingManually ?? false,
    })

    recorderApi = makeRecorderApi(loadRecorderSpy, createDeflateWorkerSpy)
    rumInit = ({ worker } = {}) => {
      recorderApi.onRumStart(
        lifeCycle,
        configuration,
        sessionManager ?? createRumSessionManagerMock().setId('1234'),
        mockViewHistory(),
        worker,
        {
          enabled: true,
          metricsEnabled: true,
        } as Telemetry
      )
    }

    registerCleanupTask(() => {
      resetDeflateWorkerState()
      replayStats.resetReplayStats()
    })
  }

  it('should report a console error and metrics but no telemetry error if CSP blocks the module', async () => {
    const loadRecorderError = new Error('Dynamic import was blocked due to Content Security Policy')
    setupRecorderApi({
      loadRecorderError,
      startSessionReplayRecordingManually: true,
    })
    rumInit()
    recorderApi.start()
    expect(loadRecorderSpy).toHaveBeenCalled()

    await wait(0)

    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Recorder failed to start'), loadRecorderError)
    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Please make sure CSP is correctly configured'))

    // There should be no actual telemetry error, but we should see the failure in the metrics.
    expect(await telemetry.getEvents()).toEqual([RECORDER_INIT_TELEMETRY])
  })

  it('should report a console error and metrics but no telemetry error if importing fails for non-CSP reasons', async () => {
    const loadRecorderError = new Error('Dynamic import failed')
    setupRecorderApi({
      loadRecorderError,
      startSessionReplayRecordingManually: true,
    })
    rumInit()
    recorderApi.start()
    expect(loadRecorderSpy).toHaveBeenCalled()

    await wait(0)

    expect(displaySpy).toHaveBeenCalledWith(jasmine.stringContaining('Recorder failed to start'), loadRecorderError)

    // There should be no actual telemetry error, but we should see the failure in the metrics.
    expect(await telemetry.getEvents()).toEqual([RECORDER_INIT_TELEMETRY])
  })
})
