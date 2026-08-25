import { registerCleanupTask, mockClock } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import type { CanvasManager } from '../canvas/canvasManager'
import { createCanvasManager } from '../canvas/canvasManager'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { Tracker } from './tracker.types'
import type { CanvasCaptureCallback } from './trackCanvasCapture'
import { trackCanvasCapture } from './trackCanvasCapture'

describe('trackCanvasCapture', () => {
  let canvas: HTMLCanvasElement
  let canvasContext: CanvasRenderingContext2D
  let canvasManager: CanvasManager
  let tracker: Tracker
  let clock: Clock
  let toBlobSpy: jasmine.Spy

  beforeEach(() => {
    clock = mockClock()
    canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvasContext = canvas.getContext('2d')!
    canvasManager = createCanvasManager()
    document.body.appendChild(canvas)
    toBlobSpy = spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake((callback) => {
      callback(new Blob([], { type: 'image/png' }))
    })

    registerCleanupTask(() => {
      tracker?.stop()
      canvas.remove()
    })
  })

  function startTracking(onCanvasCapture: CanvasCaptureCallback = jasmine.createSpy(), maxImageDimension = 1000) {
    const scope = createRecordingScopeForTesting({
      canvasManager,
      configuration: {
        sessionReplayCanvasRecording: {
          enable: true,
          maxFramesPerSecond: 1,
          hashingMaxDimension: 100,
          maxImageDimension,
        },
      },
    })
    scope.nodeIds.getOrInsert(canvas)
    tracker = trackCanvasCapture(scope, onCanvasCapture)
    return onCanvasCapture as jasmine.Spy<CanvasCaptureCallback>
  }

  function markCanvasDirtyAndWaitForCapture() {
    canvasManager.markCanvasDirty(canvas)
    clock.tick(1000)
  }

  async function waitForCanvasCapture() {
    await Promise.resolve()
    await Promise.resolve()
  }

  function draw(color: string) {
    canvasContext.fillStyle = color
    canvasContext.fillRect(0, 0, canvas.width, canvas.height)
  }

  it('captures a dirty canvas the first time it is seen', async () => {
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledOnceWith({
      nodeId: jasmine.any(Number),
      changeHash: jasmine.any(String),
      image: jasmine.any(Blob),
    })
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('discards an unchanged canvas and marks it clean', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(1)
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('captures a canvas when its content changes', async () => {
    const onCanvasCapture = startTracking()

    draw('red')
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()
    draw('blue')
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    const firstHash = onCanvasCapture.calls.argsFor(0)[0].changeHash
    const secondHash = onCanvasCapture.calls.argsFor(1)[0].changeHash
    expect(secondHash).not.toBe(firstHash)
  })

  it('downscales the captured image to the configured maximum dimension', async () => {
    draw('red')
    startTracking(jasmine.createSpy(), 1)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    const imageCanvas = toBlobSpy.calls.mostRecent().object as HTMLCanvasElement
    expect(imageCanvas.width).toBe(1)
    expect(imageCanvas.height).toBe(1)
  })

  it('leaves the canvas dirty when the capture callback fails', async () => {
    draw('red')
    const onCanvasCapture = jasmine.createSpy<CanvasCaptureCallback>().and.throwError('capture failed')
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('leaves the canvas dirty when hashing fails', async () => {
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)
    const onCanvasCapture = startTracking()
    canvasManager.markCanvasDirty(canvas)

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('does not capture masked canvases and marks them clean', async () => {
    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not emit a capture if the canvas becomes masked while capturing', async () => {
    let resolveToBlob: BlobCallback | undefined
    toBlobSpy.and.callFake((callback) => {
      resolveToBlob = callback
    })

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()

    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    resolveToBlob!(new Blob([], { type: 'image/png' }))
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('stops capturing after the tracker is stopped', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    tracker.stop()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })
})
