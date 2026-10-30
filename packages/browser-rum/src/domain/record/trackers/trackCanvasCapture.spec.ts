import type { CanvasCaptureAction } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/js-core/time'
import {
  createNewEvent,
  registerCleanupTask,
  mockClock,
  startMockTelemetry,
  waitAfterNextPaint,
} from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import { ChangeType } from '../../../types'
import type { CanvasManager } from '../canvas/canvasManager'
import { CanvasStatus, createCanvasManager } from '../canvas/canvasManager'
import { expectPixelApprox } from '../canvas/canvasImage.specHelper'
import { CANVAS_CAPTURE_TIMEOUT } from '../canvas/canvasWorker'
import { createCanvasSnapshot } from '../canvas/canvasSnapshot'
import type { NodeId } from '../encoding'
import type { EmitResourceCallback, EmitRecordCallback, EmitStatsCallback } from '../record.types'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { serializeMutations } from '../serialization'
import { MockWorker, skipIfOffscreenCanvasIsNotSupported } from '../../../../test'
import type { Tracker } from './tracker.types'
import { trackCanvasCapture } from './trackCanvasCapture'

describe('trackCanvasCapture', () => {
  let canvas: HTMLCanvasElement
  let canvasContext: CanvasRenderingContext2D
  let canvasManager: CanvasManager
  let scope: ReturnType<typeof createRecordingScopeForTesting>
  let tracker: Tracker
  let clock: Clock
  let worker: MockWorker
  let emitRecord: jasmine.Spy<EmitRecordCallback>

  const maskingByPrivacyLevel: Record<NodePrivacyLevel, boolean> = {
    [NodePrivacyLevel.ALLOW]: false,
    [NodePrivacyLevel.MASK_USER_INPUT]: false,
    [NodePrivacyLevel.MASK]: true,
    [NodePrivacyLevel.MASK_UNLESS_ALLOWLISTED]: true,
    [NodePrivacyLevel.HIDDEN]: true,
    [NodePrivacyLevel.IGNORE]: true,
  }
  const privacyLevels = Object.entries(maskingByPrivacyLevel).filter(
    ([privacyLevel]) => privacyLevel !== NodePrivacyLevel.IGNORE
  )

  beforeEach(() => {
    skipIfOffscreenCanvasIsNotSupported()
    clock = mockClock()
    worker = new MockWorker()
    canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvasContext = canvas.getContext('2d')!
    canvasManager = createCanvasManager()
    document.body.appendChild(canvas)

    registerCleanupTask(() => {
      tracker?.stop()
      canvas.remove()
    })
  })

  function startTracking(
    emitResource: jasmine.Spy<EmitResourceCallback> = jasmine.createSpy(),
    maxImageDimension = 1000,
    hashingMaxDimension = 100
  ) {
    scope = createRecordingScopeForTesting({
      canvasManager,
      configuration: {
        sessionReplayCanvasRecording: {
          enable: true,
          maxFramesPerSecond: 1,
          hashingMaxDimension,
          maxImageDimension,
          encodeQuality: 0.5,
        },
      },
    })
    scope.nodeIds.getOrInsert(canvas)
    emitRecord = jasmine.createSpy<EmitRecordCallback>()
    tracker = trackCanvasCapture(scope, worker, () => {
      serializeMutations(timeStampNow(), [], emitRecord, emitResource, jasmine.createSpy<EmitStatsCallback>(), scope)
    })
    return emitResource
  }

  function markCanvasDirtyAndWaitForCapture() {
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    clock.tick(1000)
  }

  async function waitForCanvasCapture() {
    worker.processAllMessages()
    await worker.waitForCanvasCaptures()
    await waitAfterNextPaint()
  }

  function respondToNextCapture(response: (id: number) => unknown) {
    const { id } = worker.pendingMessages.shift() as CanvasCaptureAction
    worker.dispatchEvent(createNewEvent('message', { data: response(id) }))
  }

  function draw(color: string) {
    canvasContext.fillStyle = color
    canvasContext.fillRect(0, 0, canvas.width, canvas.height)
  }

  function replaceCanvasWithNewNodeId(): NodeId {
    canvas.remove()
    canvasManager.forgetCanvas(canvas)
    scope.nodeIds.delete(canvas)
    document.body.appendChild(canvas)
    return scope.nodeIds.getOrInsert(canvas)
  }

  function firstPixelOf(image: Blob): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(image)
      const element = new Image()
      element.onload = () => {
        const decodeCanvas = document.createElement('canvas')
        decodeCanvas.width = element.naturalWidth
        decodeCanvas.height = element.naturalHeight
        const context = decodeCanvas.getContext('2d')!
        context.drawImage(element, 0, 0)
        URL.revokeObjectURL(url)
        resolve(Array.from(context.getImageData(0, 0, 1, 1).data))
      }
      element.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('failed to decode the image'))
      }
      element.src = url
    })
  }

  it('captures a dirty canvas the first time it is seen', async () => {
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledOnceWith(jasmine.any(String), jasmine.any(Blob), jasmine.any(Function))
    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[1]), [255, 0, 0, 255])
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('sends the capture settings to the worker', () => {
    startTracking(jasmine.createSpy(), 1000, 50)

    markCanvasDirtyAndWaitForCapture()

    expect(worker.pendingMessages).toEqual([
      jasmine.objectContaining({
        action: 'captureCanvas',
        canvasWidth: 2,
        canvasHeight: 2,
        lastChangeHash: undefined,
        hashingMaxDimension: 50,
        encodeQuality: 0.5,
      }),
    ])
  })

  it('looks up the node ID before reading canvas pixels', async () => {
    const drawImageSpy = spyOn(OffscreenCanvasRenderingContext2D.prototype, 'drawImage').and.callThrough()
    startTracking()
    scope.nodeIds.delete(canvas)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('discards an unchanged canvas and marks it clean', async () => {
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(1)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('retries an unchanged canvas when its resource upload is rejected', async () => {
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()
    const onDiscard = onCanvasCapture.calls.argsFor(0)[2] as () => void
    onDiscard()

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    expect(onCanvasCapture.calls.argsFor(1)[0]).toBe(onCanvasCapture.calls.argsFor(0)[0])
  })

  it('emits the snapshot taken when the capture started', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()

    draw('blue')
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    await waitForCanvasCapture()

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[1]), [255, 0, 0, 255])
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await waitForCanvasCapture()

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(1)[1]), [0, 0, 255, 255])
    expect(onCanvasCapture.calls.argsFor(1)[0]).not.toBe(onCanvasCapture.calls.argsFor(0)[0])
  })

  it('uses a WebGL snapshot captured before its drawing buffer is discarded', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    canvasManager.setCanvasSnapshot(canvas, createCanvasSnapshot(canvas, 1000)!)

    draw('blue')
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[1]), [255, 0, 0, 255])
  })

  it('keeps the WebGL snapshot for the next record stream', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    canvasManager.setCanvasSnapshot(canvas, createCanvasSnapshot(canvas, 1000)!)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    draw('blue')
    scope.resetIds()
    scope.nodeIds.getOrInsert(canvas)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(1)[1]), [255, 0, 0, 255])
  })

  const nodeIdentityChanges: Array<{ description: string; change: () => NodeId | undefined }> = [
    {
      description: 'after the recording scope is reset',
      change: () => {
        scope.resetIds()
        scope.nodeIds.getOrInsert(canvas)
        return undefined
      },
    },
    {
      description: 'when it receives a new node ID',
      change: () => replaceCanvasWithNewNodeId(),
    },
  ]

  nodeIdentityChanges.forEach(({ description, change }) => {
    it(`captures a canvas again ${description}`, async () => {
      draw('red')
      const onCanvasCapture = startTracking()
      const previousNodeId = scope.nodeIds.get(canvas)!

      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      const currentNodeId = change()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      expect(onCanvasCapture).toHaveBeenCalledTimes(2)
      if (currentNodeId !== undefined) {
        expect(currentNodeId).not.toBe(previousNodeId)
        expect(emitRecord.calls.argsFor(1)[0]).toEqual(
          jasmine.objectContaining({
            data: jasmine.arrayContaining([[ChangeType.ImageContent, [currentNodeId, jasmine.any(Number)]]]),
          })
        )
      }
    })
  })

  it('does not capture a tainted canvas that is reset while detached and then reinserted', async () => {
    const onCanvasCapture = startTracking()
    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    canvas.remove()
    canvasManager.forgetCanvas(canvas)
    scope.nodeIds.delete(canvas)
    canvas.width = 4
    draw('red')
    document.body.appendChild(canvas)
    scope.nodeIds.getOrInsert(canvas)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
  })

  it('discards an in-flight capture when the canvas receives a new node ID', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()

    const currentNodeId = replaceCanvasWithNewNodeId()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledOnceWith(jasmine.any(String), jasmine.any(Blob), jasmine.any(Function))
    expect(emitRecord.calls.argsFor(0)[0]).toEqual(
      jasmine.objectContaining({
        data: jasmine.arrayContaining([[ChangeType.ImageContent, [currentNodeId, jasmine.any(Number)]]]),
      })
    )
  })

  it('leaves the canvas dirty when emitting the canvas resource fails', async () => {
    draw('red')
    const onCanvasCapture = jasmine.createSpy<EmitResourceCallback>().and.throwError('resource failed')
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('does not mark the canvas as tainted when emitting the canvas resource throws a SecurityError', async () => {
    draw('red')
    const onCanvasCapture = jasmine
      .createSpy<EmitResourceCallback>()
      .and.throwError(new DOMException('resource emission failed', 'SecurityError'))
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('leaves the canvas dirty when the snapshot cannot be taken', async () => {
    spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('leaves the canvas dirty and reports when the worker fails to capture it', async () => {
    const telemetry = startMockTelemetry()
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    respondToNextCapture((id) => ({ type: 'canvasCaptureFailed', id, errorName: 'EncodingError' }))
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({ message: 'Canvas capture failed', 'error.name': 'EncodingError' }),
    ])
  })

  it('leaves the canvas dirty when the worker does not respond in time', async () => {
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    worker.dropNextMessage()
    clock.tick(CANVAS_CAPTURE_TIMEOUT)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('ignores responses to other captures', async () => {
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    worker.dispatchEvent(createNewEvent('message', { data: { type: 'canvasUnchanged', id: -1 } }))
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(1)
  })

  it('stops trying to capture a canvas when taking the snapshot throws', async () => {
    const drawImageSpy = spyOn(OffscreenCanvasRenderingContext2D.prototype, 'drawImage').and.callFake(() => {
      throw new DOMException('canvas is tainted', 'SecurityError')
    })
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(drawImageSpy.calls.argsFor(0).slice(0, 5)).toEqual([canvas, 0, 0, 2, 2])
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  for (const [privacyLevel, masked] of privacyLevels) {
    it(`${masked ? 'does not capture' : 'captures'} a canvas when the privacy level is ${privacyLevel}`, async () => {
      canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      if (masked) {
        expect(onCanvasCapture).not.toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
      } else {
        expect(onCanvasCapture).toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([])
      }
    })
  }

  it('captures a dirty canvas after its privacy level becomes allow', async () => {
    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()

    canvas.setAttribute(PRIVACY_ATTR_NAME, NodePrivacyLevel.ALLOW)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  // The privacy level is checked again when the captured image is serialized. That check has to
  // agree with the one made before capturing, otherwise a canvas we did capture is never emitted.
  for (const [privacyLevel, masked] of privacyLevels) {
    if (privacyLevel === NodePrivacyLevel.ALLOW) {
      continue // the canvas already has the allow privacy level by default
    }

    it(`${masked ? 'does not emit' : 'emits'} a snapshot when the canvas privacy level becomes ${privacyLevel} while the worker captures it`, async () => {
      draw('red')
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()

      canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
      await waitForCanvasCapture()

      if (masked) {
        expect(onCanvasCapture).not.toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
      } else {
        expect(onCanvasCapture).toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([])
      }
    })
  }

  it('stops capturing after the tracker is stopped', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    tracker.stop()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })
})
