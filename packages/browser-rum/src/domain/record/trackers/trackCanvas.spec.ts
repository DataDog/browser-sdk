import { globalObject, noop } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import {
  registerCleanupTask,
  replaceMockable,
  replaceMockableWithSpy,
  startMockTelemetry,
} from '@datadog/browser-core/test'
import { MockWorker, skipIfOffscreenCanvasIsNotSupported } from '../../../../test'
import {
  createDeflateWorker,
  DeflateWorkerStatus,
  getDeflateWorkerStatus,
  resetDeflateWorkerState,
} from '../../deflate'
import { resetCanvasWorkerWarning } from '../canvas/canvasWorker'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackCanvas } from './trackCanvas'

describe('trackCanvas', () => {
  const CANVAS_RECORDING_CONFIGURATION: Partial<RumConfiguration> = {
    sessionReplayCanvasRecording: {
      enable: true,
      maxFramesPerSecond: 1,
      hashingMaxDimension: 100,
      maxImageDimension: 1000,
      encodeQuality: 0.5,
    },
  }
  let mockWorker: MockWorker
  let createDeflateWorkerSpy: jasmine.Spy
  let originalFillRect: unknown

  beforeEach(() => {
    mockWorker = new MockWorker()
    createDeflateWorkerSpy = replaceMockableWithSpy(createDeflateWorker).and.callFake(() => mockWorker)
    originalFillRect = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillRect')!.value
    registerCleanupTask(() => {
      resetDeflateWorkerState()
      resetCanvasWorkerWarning()
    })
  })

  function startTracking(configuration?: Partial<RumConfiguration>) {
    const tracker = trackCanvas(createRecordingScopeForTesting({ configuration }), noop)
    registerCleanupTask(() => tracker.stop())
    return tracker
  }

  function isFillRectInstrumented() {
    return Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillRect')!.value !== originalFillRect
  }

  it('instruments canvas drawing in a canvas worker when canvas recording is enabled', () => {
    skipIfOffscreenCanvasIsNotSupported()

    startTracking(CANVAS_RECORDING_CONFIGURATION)

    expect(isFillRectInstrumented()).toBe(true)
    expect(getDeflateWorkerStatus('canvas')).toBe(DeflateWorkerStatus.Loading)
  })

  it('stops instrumenting canvas drawing when stopped', () => {
    skipIfOffscreenCanvasIsNotSupported()

    startTracking(CANVAS_RECORDING_CONFIGURATION).stop()

    expect(isFillRectInstrumented()).toBe(false)
  })

  it('does not instrument canvas drawing when canvas recording is disabled', () => {
    startTracking()

    expect(isFillRectInstrumented()).toBe(false)
    expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
  })

  it('does not instrument canvas drawing when the maximum frame rate is zero', () => {
    startTracking({
      sessionReplayCanvasRecording: {
        ...CANVAS_RECORDING_CONFIGURATION.sessionReplayCanvasRecording!,
        maxFramesPerSecond: 0,
      },
    })

    expect(isFillRectInstrumented()).toBe(false)
    expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
  })

  it('does not record canvases when OffscreenCanvas is not supported', async () => {
    replaceMockable(globalObject.OffscreenCanvas, undefined as unknown as typeof OffscreenCanvas)
    const displayWarnSpy = spyOn(display, 'warn')
    const telemetry = startMockTelemetry()

    startTracking(CANVAS_RECORDING_CONFIGURATION).stop()
    startTracking(CANVAS_RECORDING_CONFIGURATION)

    expect(isFillRectInstrumented()).toBe(false)
    expect(createDeflateWorkerSpy).not.toHaveBeenCalled()
    expect(displayWarnSpy).toHaveBeenCalledOnceWith('Session Replay canvas recording is not supported by this browser.')
    expect(await telemetry.getEvents()).toEqual([jasmine.objectContaining({ message: 'Canvas recording unsupported' })])
  })

  it('stops the canvas trackers when the canvas worker fails to start', () => {
    skipIfOffscreenCanvasIsNotSupported()
    spyOn(display, 'error')
    startTracking(CANVAS_RECORDING_CONFIGURATION)

    mockWorker.dispatchErrorEvent()

    expect(isFillRectInstrumented()).toBe(false)
  })

  it('does not start the canvas trackers when the canvas worker already failed', () => {
    skipIfOffscreenCanvasIsNotSupported()
    spyOn(display, 'error')
    createDeflateWorkerSpy.and.throwError(new Error('CSP'))

    startTracking(CANVAS_RECORDING_CONFIGURATION)

    expect(isFillRectInstrumented()).toBe(false)
  })
})
