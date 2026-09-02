import { globalObject } from '@datadog/js-core/util'
import {
  collectAsyncCalls,
  registerCleanupTask,
  mockClock,
  replaceMockable,
  waitAfterNextPaint,
} from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import type { CanvasManager } from '../canvas/canvasManager'
import { CanvasStatus, createCanvasManager } from '../canvas/canvasManager'
import type { NodeId } from '../encoding'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { Tracker } from './tracker.types'
import type { CanvasCaptureCallback } from './trackCanvasCapture'
import { trackCanvasCapture } from './trackCanvasCapture'

describe('trackCanvasCapture', () => {
  let canvas: HTMLCanvasElement
  let canvasContext: CanvasRenderingContext2D
  let canvasManager: CanvasManager
  let scope: ReturnType<typeof createRecordingScopeForTesting>
  let tracker: Tracker
  let clock: Clock
  let toBlobSpy: jasmine.Spy
  const privacyLevels = Object.values(NodePrivacyLevel).filter(
    (privacyLevel) => privacyLevel !== NodePrivacyLevel.IGNORE
  )

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

  function startTracking(
    onCanvasCapture: CanvasCaptureCallback = jasmine.createSpy(),
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
        },
      },
    })
    scope.nodeIds.getOrInsert(canvas)
    tracker = trackCanvasCapture(scope, onCanvasCapture)
    return onCanvasCapture as jasmine.Spy<CanvasCaptureCallback>
  }

  function markCanvasDirtyAndWaitForCapture() {
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    clock.tick(1000)
  }

  async function waitForCanvasCapture() {
    await waitAfterNextPaint()
    await Promise.resolve()
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

  function firstPixelOf(image: Blob) {
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

    expect(onCanvasCapture).toHaveBeenCalledOnceWith({
      nodeId: jasmine.any(Number),
      changeHash: jasmine.any(String),
      image: jasmine.any(Blob),
    })
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('looks up the node ID before reading canvas pixels', async () => {
    const drawImageSpy = spyOn(CanvasRenderingContext2D.prototype, 'drawImage').and.callThrough()
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

  it('hashes and emits the same immutable canvas snapshot', async () => {
    let resolveFirstDigest!: () => void
    let isFirstDigest = true
    const digestSpy = jasmine.createSpy().and.callFake((_algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data)
      const result = Uint8Array.of(bytes[0]).buffer

      if (isFirstDigest) {
        isFirstDigest = false
        return new Promise<ArrayBuffer>((resolve) => {
          resolveFirstDigest = () => resolve(result)
        })
      }
      return Promise.resolve(result)
    })
    replaceMockable(globalObject.crypto?.subtle, { digest: digestSpy } as unknown as SubtleCrypto)
    // The emitted image is the assertion here, so it has to be a real PNG rather than the empty
    // blob the suite stubs in.
    toBlobSpy.and.callThrough()

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(digestSpy).toHaveBeenCalledTimes(1)
    draw('blue')
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    resolveFirstDigest()
    await collectAsyncCalls(onCanvasCapture, 1)

    expect(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[0].image)).toEqual([255, 0, 0, 255])
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 2)

    expect(await firstPixelOf(onCanvasCapture.calls.argsFor(1)[0].image)).toEqual([0, 0, 255, 255])
    expect(onCanvasCapture.calls.argsFor(1)[0].changeHash).not.toBe(onCanvasCapture.calls.argsFor(0)[0].changeHash)
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

      const firstCapture = collectAsyncCalls(onCanvasCapture, 1)
      markCanvasDirtyAndWaitForCapture()
      await firstCapture
      // The next timeout is scheduled in the previous capture task's `finally` block.
      // Wait for that task to finish before changing the scope and advancing the clock.
      await waitForCanvasCapture()

      const currentNodeId = change()
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

      const secondCapture = collectAsyncCalls(onCanvasCapture, 2)
      clock.tick(1000)
      await secondCapture

      expect(onCanvasCapture).toHaveBeenCalledTimes(2)
      if (currentNodeId !== undefined) {
        expect(currentNodeId).not.toBe(previousNodeId)
        expect(onCanvasCapture.calls.argsFor(1)[0].nodeId).toBe(currentNodeId)
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
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
  })

  function deferFirstDigest(): () => void {
    let resolveFirstDigest!: (value: ArrayBuffer) => void
    const firstDigestPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveFirstDigest = resolve
    })
    let isFirstDigest = true
    const digestSpy = jasmine.createSpy().and.callFake(() => {
      if (isFirstDigest) {
        isFirstDigest = false
        return firstDigestPromise
      }
      return Promise.resolve(new ArrayBuffer(32))
    })
    replaceMockable(globalObject.crypto?.subtle, { digest: digestSpy } as unknown as SubtleCrypto)
    return () => resolveFirstDigest(new ArrayBuffer(32))
  }

  function deferFirstBlob(): () => void {
    let resolveFirstBlob!: BlobCallback
    let isFirstBlob = true
    toBlobSpy.and.callFake((callback: BlobCallback) => {
      if (isFirstBlob) {
        isFirstBlob = false
        resolveFirstBlob = callback
      } else {
        callback(new Blob([], { type: 'image/png' }))
      }
    })
    return () => resolveFirstBlob(new Blob([], { type: 'image/png' }))
  }

  const nodeIdChangeCaptureStages: Array<{ description: string; deferCapture: () => () => void }> = [
    { description: 'while hashing', deferCapture: deferFirstDigest },
    { description: 'while encoding', deferCapture: deferFirstBlob },
  ]

  nodeIdChangeCaptureStages.forEach(({ description, deferCapture }) => {
    it(`discards an in-flight capture when the canvas receives a new node ID ${description}`, async () => {
      const resumeCapture = deferCapture()
      draw('red')
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      const currentNodeId = replaceCanvasWithNewNodeId()
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
      resumeCapture()
      await waitForCanvasCapture()

      expect(onCanvasCapture).not.toHaveBeenCalled()

      clock.tick(1000)
      await waitForCanvasCapture()

      expect(onCanvasCapture).toHaveBeenCalledOnceWith({
        nodeId: currentNodeId,
        changeHash: jasmine.any(String),
        image: jasmine.any(Blob),
      })
    })
  })

  it('leaves the canvas dirty when the capture callback fails', async () => {
    draw('red')
    const onCanvasCapture = jasmine.createSpy<CanvasCaptureCallback>().and.throwError('capture failed')
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('leaves the canvas dirty when hashing is unavailable', async () => {
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)
    const onCanvasCapture = startTracking()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('stops trying to capture a canvas when taking the snapshot throws', async () => {
    const drawImageSpy = spyOn(CanvasRenderingContext2D.prototype, 'drawImage').and.callFake(() => {
      throw new DOMException('canvas is tainted', 'SecurityError')
    })
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(drawImageSpy.calls.argsFor(0).slice(0, 5)).toEqual([canvas, 0, 0, 2, 2])
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  for (const privacyLevel of privacyLevels) {
    it(`only captures canvases with the allow privacy level, when the privacy level is ${privacyLevel}`, async () => {
      canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      if (privacyLevel === NodePrivacyLevel.ALLOW) {
        expect(onCanvasCapture).toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([])
      } else {
        expect(onCanvasCapture).not.toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
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

  const maskingCaptureStages: Array<{ description: string; deferCapture: () => () => void }> = [
    { description: 'while hashing', deferCapture: deferFirstDigest },
    { description: 'while encoding', deferCapture: deferFirstBlob },
  ]

  maskingCaptureStages.forEach(({ description, deferCapture }) => {
    it(`emits the snapshot taken before the canvas becomes masked ${description}`, async () => {
      const resumeCapture = deferCapture()
      draw('red')
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
      resumeCapture()
      await waitForCanvasCapture()

      expect(onCanvasCapture).toHaveBeenCalledOnceWith({
        nodeId: jasmine.any(Number),
        changeHash: jasmine.any(String),
        image: jasmine.any(Blob),
      })
      expect(canvasManager.takeCapturableCanvases()).toEqual([])
    })
  })

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
