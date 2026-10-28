import type { CanvasCaptureAction, CanvasCaptureResponse } from '@datadog/browser-core'
import { display } from '@datadog/browser-core'
import { collectAsyncCalls, createNewEvent, mockClock, registerCleanupTask, replaceMockable } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { MockWorker } from '../../../../test'
import { createDeflateWorker, INITIALIZATION_TIME_OUT_DELAY, resetDeflateWorkerState } from '../../deflate'
import { createCanvasSnapshot } from './canvasSnapshot'
import type { CanvasWorker } from './canvasWorker'
import { CANVAS_CAPTURE_TIMEOUT_DELAY, isCanvasWorkerSupported, startCanvasWorker } from './canvasWorker'

const CONFIGURATION = {
  sessionReplayCanvasRecording: {
    enable: true,
    maxFramesPerSecond: 1,
    hashingMaxDimension: 50,
    maxImageDimension: 1000,
    encodeQuality: 0.5,
  },
} as RumConfiguration

describe('startCanvasWorker', () => {
  let worker: MockWorker
  let postMessageSpy: jasmine.Spy<MockWorker['postMessage']>
  let onFailure: jasmine.Spy
  let canvasWorker: CanvasWorker
  let clock: Clock
  let createWorker: () => MockWorker

  beforeEach(() => {
    if (!isCanvasWorkerSupported()) {
      pending('canvas recording not supported')
    }
    clock = mockClock()
    worker = new MockWorker()
    postMessageSpy = spyOn(worker, 'postMessage').and.callFake((message) => {
      worker.pendingMessages.push(message)
    })
    createWorker = () => worker
    replaceMockable(createDeflateWorker, () => createWorker())
    onFailure = jasmine.createSpy()
    canvasWorker = startCanvasWorker(CONFIGURATION, onFailure)

    registerCleanupTask(() => {
      canvasWorker.stop()
      resetDeflateWorkerState()
    })
  })

  function createSnapshot() {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvas.getContext('2d')!.fillRect(0, 0, 2, 2)
    return createCanvasSnapshot(canvas, 1000)
  }

  // The first message is 'init', the second is the capture request
  async function waitForCaptureRequest() {
    const calls = await collectAsyncCalls(postMessageSpy, 2)
    return calls.argsFor(1)[0] as CanvasCaptureAction
  }

  function respond(response: CanvasCaptureResponse) {
    worker.dispatchEvent(createNewEvent('message', { data: response }))
  }

  it('is ready once the canvas worker is initialized', () => {
    expect(canvasWorker.isReady()).toBeFalse()

    worker.processAllMessages()

    expect(canvasWorker.isReady()).toBeTrue()
  })

  it('transfers the snapshot bitmap to the canvas worker and resolves with its response', async () => {
    worker.processAllMessages()

    const capture = canvasWorker.capture(createSnapshot(), 'previous-hash')
    const request = await waitForCaptureRequest()
    respond({ type: 'canvasUnchanged', id: request.id })

    expect(await capture).toEqual({ type: 'canvasUnchanged', id: request.id })
    expect(request).toEqual({
      action: 'captureCanvas',
      id: jasmine.any(Number),
      bitmap: jasmine.any(ImageBitmap),
      canvasWidth: 2,
      canvasHeight: 2,
      lastChangeHash: 'previous-hash',
      hashingMaxDimension: 50,
      encodeQuality: 0.5,
    })
    expect(postMessageSpy).toHaveBeenCalledWith(request, [request.bitmap])
  })

  it('ignores responses to other captures', async () => {
    worker.processAllMessages()

    const captureSpy = jasmine.createSpy()
    void canvasWorker.capture(createSnapshot(), undefined).then(captureSpy)
    const request = await waitForCaptureRequest()
    respond({ type: 'canvasUnchanged', id: request.id + 1 })
    await Promise.resolve()

    expect(captureSpy).not.toHaveBeenCalled()
  })

  it('fails with a timeout when a capture is not answered, e.g. by an older self-hosted worker', async () => {
    worker.processAllMessages()

    const capture = canvasWorker.capture(createSnapshot(), undefined)
    await waitForCaptureRequest()
    clock.tick(CANVAS_CAPTURE_TIMEOUT_DELAY)

    expect(await capture).toBeUndefined()
    expect(onFailure).toHaveBeenCalledOnceWith('timeout')
    expect(canvasWorker.isReady()).toBeFalse()
  })

  it('fails when the canvas worker does not initialize', () => {
    spyOn(display, 'error')

    clock.tick(INITIALIZATION_TIME_OUT_DELAY)

    expect(onFailure).toHaveBeenCalledOnceWith('spawn')
  })

  it('fails when the canvas worker cannot be created', () => {
    spyOn(display, 'error')
    resetDeflateWorkerState()
    createWorker = () => {
      throw new Error('blocked')
    }
    const otherOnFailure = jasmine.createSpy()

    startCanvasWorker(CONFIGURATION, otherOnFailure)

    expect(otherOnFailure).toHaveBeenCalledOnceWith('spawn')
  })

  it('resolves pending captures and closes new snapshots once stopped', async () => {
    worker.processAllMessages()
    const pendingCapture = canvasWorker.capture(createSnapshot(), undefined)
    await waitForCaptureRequest()

    canvasWorker.stop()
    const snapshot = createSnapshot()
    const bitmap = await snapshot.bitmap

    expect(await pendingCapture).toBeUndefined()
    expect(await canvasWorker.capture(snapshot, undefined)).toBeUndefined()
    expect(bitmap.width).toBe(0)
    expect(onFailure).not.toHaveBeenCalled()
  })
})
