import type { DeflateWorker, RawTelemetryEvent } from '@flashcatcloud/browser-core'
import { display, resetTelemetry, startFakeTelemetry } from '@flashcatcloud/browser-core'
import type { RecorderApi, RumSessionManager } from '@flashcatcloud/browser-rum-core'
import { LifeCycle } from '@flashcatcloud/browser-rum-core'
import { registerCleanupTask, wait } from '@flashcatcloud/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration, mockViewHistory } from '../../../rum-core/test'
import type { CreateDeflateWorker } from '../domain/deflate'
import { MockWorker } from '../../test'
import { resetDeflateWorkerState } from '../domain/deflate'
import * as replayStats from '../domain/replayStats'
import { makeRecorderApi } from './recorderApi'
import type { StartRecording } from './postStartStrategy'
import { lazyLoadRecorder } from './lazyLoadRecorder'

describe('lazyLoadRecorder', () => {
  let displaySpy: jasmine.Spy
  let telemetryEvents: RawTelemetryEvent[]
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
    telemetryEvents = startFakeTelemetry()
    mockWorker = new MockWorker()
    createDeflateWorkerSpy = jasmine.createSpy('createDeflateWorkerSpy').and.callFake(() => mockWorker)
    displaySpy = spyOn(display, 'error')

    lifeCycle = new LifeCycle()
    stopRecordingSpy = jasmine.createSpy('stopRecording')
    startRecordingSpy = jasmine.createSpy('startRecording')

    // Workaround because using resolveTo(startRecordingSpy) was not working
    loadRecorderSpy = jasmine.createSpy('loadRecorder').and.resolveTo((...args: any) => {
      if (loadRecorderError) {
        return lazyLoadRecorder(() => Promise.reject(loadRecorderError))
      }
      startRecordingSpy(...args)
      return {
        stop: stopRecordingSpy,
      }
    })

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
      replayStats.resetReplayStats()
      resetTelemetry()
    })
  }

  it('should report an error but no telemetry if CSP blocks the module', async () => {
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
    expect(telemetryEvents.length).toBe(0)
  })

  it('should report an error but no telemetry if importing fails for non-CSP reasons', async () => {
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
    expect(telemetryEvents.length).toBe(0)
  })
})
