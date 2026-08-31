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
import { createCanvasManager } from '../canvas/canvasManager'
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
    canvasManager.markCanvasDirty(canvas)
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

  it('looks up the node ID before reading canvas pixels', async () => {
    const drawImageSpy = spyOn(CanvasRenderingContext2D.prototype, 'drawImage').and.callThrough()
    startTracking()
    scope.nodeIds.delete(canvas)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).not.toHaveBeenCalled()
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
    const firstCapture = collectAsyncCalls(onCanvasCapture, 1)
    markCanvasDirtyAndWaitForCapture()
    await firstCapture
    // Wait for the capture promise to finish after the callback has been called. Otherwise the
    // second interval tick can happen while the first capture is still marked as in flight.
    await waitForCanvasCapture()

    draw('blue')
    const secondCapture = collectAsyncCalls(onCanvasCapture, 2)
    markCanvasDirtyAndWaitForCapture()
    await secondCapture

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    const firstHash = onCanvasCapture.calls.argsFor(0)[0].changeHash
    const secondHash = onCanvasCapture.calls.argsFor(1)[0].changeHash
    expect(secondHash).not.toBe(firstHash)
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

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(digestSpy).toHaveBeenCalledTimes(1)
    draw('blue')
    canvasManager.markCanvasDirty(canvas)
    resolveFirstDigest()
    await waitForCanvasCapture()

    const firstImageCanvas = toBlobSpy.calls.mostRecent().object as HTMLCanvasElement
    expect(Array.from(firstImageCanvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255])
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    clock.tick(1000)
    await waitForCanvasCapture()

    const secondImageCanvas = toBlobSpy.calls.mostRecent().object as HTMLCanvasElement
    expect(Array.from(secondImageCanvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([0, 0, 255, 255])
    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    expect(onCanvasCapture.calls.argsFor(1)[0].changeHash).not.toBe(onCanvasCapture.calls.argsFor(0)[0].changeHash)
  })

  it('captures a canvas when its dimensions change but its downscaled pixels do not', async () => {
    draw('red')
    const onCanvasCapture = startTracking(jasmine.createSpy(), 1000, 1)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    canvas.width = 4
    canvas.height = 4
    draw('red')
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    expect(onCanvasCapture.calls.argsFor(1)[0].changeHash).not.toBe(onCanvasCapture.calls.argsFor(0)[0].changeHash)
  })

  it('captures a canvas again after the recording scope is reset', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    scope.resetIds()
    scope.nodeIds.getOrInsert(canvas)
    canvasManager.markCanvasDirty(canvas)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
  })

  it('captures a canvas again when it receives a new node ID', async () => {
    draw('red')
    const onCanvasCapture = startTracking()
    const previousNodeId = scope.nodeIds.get(canvas)!
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    canvas.remove()
    canvasManager.forgetCanvasNode(canvas)
    scope.nodeIds.delete(canvas)
    document.body.appendChild(canvas)
    const currentNodeId = scope.nodeIds.getOrInsert(canvas)
    canvasManager.markCanvasDirty(canvas)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(currentNodeId).not.toBe(previousNodeId)
    expect(onCanvasCapture).toHaveBeenCalledTimes(2)
    expect(onCanvasCapture.calls.argsFor(1)[0].nodeId).toBe(currentNodeId)
  })

  it('captures a tainted canvas that is reset while detached and then reinserted', async () => {
    const onCanvasCapture = startTracking()
    canvasManager.markCanvasTainted(canvas)

    canvas.remove()
    canvasManager.forgetCanvasNode(canvas)
    scope.nodeIds.delete(canvas)
    canvas.width = 4
    draw('red')
    document.body.appendChild(canvas)
    const currentNodeId = scope.nodeIds.getOrInsert(canvas)
    canvasManager.markCanvasDirty(canvas)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledOnceWith({
      nodeId: currentNodeId,
      changeHash: jasmine.any(String),
      image: jasmine.any(Blob),
    })
  })

  it('discards an in-flight capture when the canvas receives a new node ID', async () => {
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

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    canvas.remove()
    canvasManager.forgetCanvasNode(canvas)
    scope.nodeIds.delete(canvas)
    document.body.appendChild(canvas)
    const currentNodeId = scope.nodeIds.getOrInsert(canvas)
    canvasManager.markCanvasDirty(canvas)
    resolveFirstDigest(new ArrayBuffer(32))
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

  it('discards an image being encoded when the canvas receives a new node ID', async () => {
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

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    canvas.remove()
    canvasManager.forgetCanvasNode(canvas)
    scope.nodeIds.delete(canvas)
    document.body.appendChild(canvas)
    const currentNodeId = scope.nodeIds.getOrInsert(canvas)
    canvasManager.markCanvasDirty(canvas)
    resolveFirstBlob(new Blob([], { type: 'image/png' }))
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

  it('downscales the captured image to the configured maximum dimension', async () => {
    draw('red')
    startTracking(jasmine.createSpy(), 1)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    const imageCanvas = toBlobSpy.calls.mostRecent().object as HTMLCanvasElement
    expect(imageCanvas.width).toBe(1)
    expect(imageCanvas.height).toBe(1)
  })

  it('uses createImageBitmap to resize the captured image when available', async () => {
    if (!globalObject.createImageBitmap) {
      return
    }

    const createImageBitmapSpy = spyOn(globalObject, 'createImageBitmap').and.callThrough()
    draw('red')
    startTracking(jasmine.createSpy(), 1)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(createImageBitmapSpy.calls.count()).toBe(1)
    expect(createImageBitmapSpy.calls.argsFor(0)).toEqual([
      canvas,
      {
        resizeHeight: 1,
        resizeQuality: 'low',
        resizeWidth: 1,
      },
    ])
  })

  it('captures a canvas when SubtleCrypto is unavailable', async () => {
    replaceMockable(globalObject.crypto?.subtle, undefined)
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('captures a canvas when createImageBitmap is unavailable', async () => {
    replaceMockable<typeof globalObject.createImageBitmap | undefined>(globalObject.createImageBitmap, undefined)
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('falls back to drawing the canvas when createImageBitmap rejects', async () => {
    const createImageBitmapSpy = jasmine.createSpy().and.returnValue(Promise.reject(new Error('unsupported')))
    replaceMockable(globalObject.createImageBitmap, createImageBitmapSpy)
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(createImageBitmapSpy).toHaveBeenCalled()
    expect(onCanvasCapture).toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not use the drawing fallback if the canvas becomes masked while createImageBitmap is pending', async () => {
    let rejectImageBitmap!: (reason: Error) => void
    const imageBitmapPromise = new Promise<ImageBitmap>((_, reject) => {
      rejectImageBitmap = reject
    })
    const createImageBitmapSpy = jasmine.createSpy().and.returnValue(imageBitmapPromise)
    replaceMockable(globalObject.createImageBitmap, createImageBitmapSpy)
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()
    expect(createImageBitmapSpy).toHaveBeenCalled()

    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    rejectImageBitmap(new Error('unsupported'))
    await waitForCanvasCapture()

    expect(toBlobSpy).not.toHaveBeenCalled()
    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('leaves the canvas dirty when the capture callback fails', async () => {
    draw('red')
    const onCanvasCapture = jasmine.createSpy<CanvasCaptureCallback>().and.throwError('capture failed')
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('leaves the canvas dirty when hashing is unavailable', async () => {
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue(null)
    const onCanvasCapture = startTracking()
    canvasManager.markCanvasDirty(canvas)

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
  })

  it('stops trying to capture a canvas when hashing throws', async () => {
    replaceMockable<typeof globalObject.createImageBitmap | undefined>(globalObject.createImageBitmap, undefined)
    const drawImageSpy = spyOn(CanvasRenderingContext2D.prototype, 'drawImage').and.callFake(() => {
      throw new DOMException('canvas is tainted', 'SecurityError')
    })
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(drawImageSpy.calls.argsFor(0).slice(0, 5)).toEqual([canvas, 0, 0, 2, 2])
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()

    canvasManager.markCanvasDirty(canvas)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  for (const privacyLevel of privacyLevels) {
    it(`only captures canvases with the allow privacy level, when the privacy level is ${privacyLevel}`, async () => {
      canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await waitForCanvasCapture()

      if (privacyLevel === NodePrivacyLevel.ALLOW) {
        expect(onCanvasCapture).toHaveBeenCalled()
        expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
      } else {
        expect(onCanvasCapture).not.toHaveBeenCalled()
        expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()
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
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('emits the immutable snapshot taken before a canvas becomes masked while hashing', async () => {
    let resolveDigest!: (value: ArrayBuffer) => void
    const digestPromise = new Promise<ArrayBuffer>((resolve) => {
      resolveDigest = resolve
    })
    const digestSpy = jasmine.createSpy().and.returnValue(digestPromise)
    replaceMockable(globalObject.crypto?.subtle, { digest: digestSpy } as unknown as SubtleCrypto)

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(digestSpy).toHaveBeenCalled()
    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    resolveDigest(new ArrayBuffer(32))
    await waitForCanvasCapture()

    expect(toBlobSpy).toHaveBeenCalled()
    expect(onCanvasCapture).toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('emits the snapshot that was taken before the canvas became masked while encoding', async () => {
    let resolveToBlob: BlobCallback | undefined
    toBlobSpy.and.callFake((callback) => {
      resolveToBlob = callback
    })

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    canvas.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK)
    resolveToBlob!(new Blob([], { type: 'image/png' }))
    await waitForCanvasCapture()

    expect(onCanvasCapture).toHaveBeenCalledOnceWith({
      nodeId: jasmine.any(Number),
      changeHash: jasmine.any(String),
      image: jasmine.any(Blob),
    })
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
