import { vi, beforeEach, describe, expect, it } from 'vitest'
import type { Mock } from 'vitest'
import { globalObject } from '@datadog/js-core/util'
import { timeStampNow } from '@datadog/js-core/time'
import {
  collectAsyncCalls,
  registerCleanupTask,
  mockClock,
  replaceMockable,
  waitAfterNextPaint,
} from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import { ChangeType } from '../../../types'
import type { CanvasManager } from '../canvas/canvasManager'
import { CanvasStatus, createCanvasManager } from '../canvas/canvasManager'
import { expectPixelApprox } from '../canvas/canvasImage.specHelper'
import { createCanvasSnapshot } from '../canvas/canvasSnapshot'
import type { NodeId } from '../encoding'
import type { EmitResourceCallback, EmitRecordCallback, EmitStatsCallback } from '../record.types'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { serializeMutations } from '../serialization'
import type { Tracker } from './tracker.types'
import { trackCanvasCapture } from './trackCanvasCapture'

describe('trackCanvasCapture', () => {
  let canvas: HTMLCanvasElement
  let canvasContext: CanvasRenderingContext2D
  let canvasManager: CanvasManager
  let scope: ReturnType<typeof createRecordingScopeForTesting>
  let tracker: Tracker
  let clock: Clock
  let toBlobSpy: Mock<HTMLCanvasElement['toBlob']>
  let emitRecord: Mock<EmitRecordCallback>

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
    clock = mockClock()
    canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvasContext = canvas.getContext('2d')!
    canvasManager = createCanvasManager()
    document.body.appendChild(canvas)
    toBlobSpy = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(new Blob([], { type: 'image/webp' }))
    })

    registerCleanupTask(() => {
      tracker?.stop()
      canvas.remove()
    })
  })

  function startTracking(
    emitResource: Mock<EmitResourceCallback> = vi.fn(),
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
    emitRecord = vi.fn<EmitRecordCallback>()
    tracker = trackCanvasCapture(scope, () => {
      serializeMutations(timeStampNow(), [], emitRecord, emitResource, vi.fn<EmitStatsCallback>(), scope)
    })
    return emitResource
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

    expect(onCanvasCapture).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.any(Blob), expect.any(Function))
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('looks up the node ID before reading canvas pixels', async () => {
    const drawImageSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage')
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

    const firstCapture = collectAsyncCalls(onCanvasCapture, 1)
    markCanvasDirtyAndWaitForCapture()
    await firstCapture
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
    await collectAsyncCalls(onCanvasCapture, 1)
    await waitForCanvasCapture()
    const onDiscard = onCanvasCapture.mock.calls[0][2] as () => void
    onDiscard()

    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 2)

    expect(onCanvasCapture.mock.calls[1][0]).toBe(onCanvasCapture.mock.calls[0][0])
  })

  it('hashes and emits the same immutable canvas snapshot', async () => {
    let resolveFirstDigest!: () => void
    let isFirstDigest = true
    const digestSpy = vi.fn().mockImplementation((_algorithm: AlgorithmIdentifier, data: BufferSource) => {
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
    // The emitted image is the assertion here, so it has to be a real WebP rather than the empty
    // blob the suite stubs in.
    toBlobSpy.mockReset()

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(digestSpy).toHaveBeenCalledTimes(1)
    draw('blue')
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    resolveFirstDigest()
    await collectAsyncCalls(onCanvasCapture, 1)
    await waitForCanvasCapture()

    expectPixelApprox(await firstPixelOf(onCanvasCapture.mock.calls[0][1]), [255, 0, 0, 255])
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 2)

    expectPixelApprox(await firstPixelOf(onCanvasCapture.mock.calls[1][1]), [0, 0, 255, 255])
    expect(onCanvasCapture.mock.calls[1][0]).not.toBe(onCanvasCapture.mock.calls[0][0])
  })

  it('uses a WebGL snapshot captured before its drawing buffer is discarded', async () => {
    toBlobSpy.mockReset()
    draw('red')
    const snapshot = createCanvasSnapshot(canvas, 1000)!
    const onCanvasCapture = startTracking()
    canvasManager.setCanvasSnapshot(canvas, snapshot)

    draw('blue')
    markCanvasDirtyAndWaitForCapture()
    await collectAsyncCalls(onCanvasCapture, 1)

    expectPixelApprox(await firstPixelOf(onCanvasCapture.mock.calls[0][1]), [255, 0, 0, 255])
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
        expect(emitRecord.mock.calls[1][0]).toEqual(
          expect.objectContaining({
            data: expect.arrayContaining([[ChangeType.ImageContent, [currentNodeId, expect.any(Number)]]]),
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
    const digestSpy = vi.fn().mockImplementation(() => {
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
    toBlobSpy.mockImplementation((callback: BlobCallback) => {
      if (isFirstBlob) {
        isFirstBlob = false
        resolveFirstBlob = callback
      } else {
        callback(new Blob([], { type: 'image/webp' }))
      }
    })
    return () => resolveFirstBlob(new Blob([], { type: 'image/webp' }))
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

      expect(onCanvasCapture).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        expect.any(Blob),
        expect.any(Function)
      )
      expect(emitRecord.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          data: expect.arrayContaining([[ChangeType.ImageContent, [currentNodeId, expect.any(Number)]]]),
        })
      )
    })
  })

  it('leaves the canvas dirty when emitting the canvas resource fails', async () => {
    draw('red')
    const onCanvasCapture: Mock<EmitResourceCallback> = vi.fn().mockImplementation(() => {
      throw new Error('resource failed')
    })
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('does not mark the canvas as tainted when emitting the canvas resource throws a SecurityError', async () => {
    draw('red')
    const onCanvasCapture: Mock<EmitResourceCallback> = vi.fn().mockImplementation(() => {
      throw new DOMException('resource emission failed', 'SecurityError')
    })
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('leaves the canvas dirty when hashing is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onCanvasCapture = startTracking()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('stops trying to capture a canvas when taking the snapshot throws', async () => {
    const drawImageSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'drawImage').mockImplementation(() => {
      throw new DOMException('canvas is tainted', 'SecurityError')
    })
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(drawImageSpy).toHaveBeenCalledTimes(1)
    expect(drawImageSpy.mock.calls[0].slice(0, 5)).toEqual([canvas, 0, 0, 2, 2])
    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
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

  const maskingCaptureStages: Array<{ description: string; deferCapture: () => () => void }> = [
    { description: 'while hashing', deferCapture: deferFirstDigest },
    { description: 'while encoding', deferCapture: deferFirstBlob },
  ]

  // The privacy level is checked again when the captured image is serialized. That check has to
  // agree with the one made before capturing, otherwise a canvas we did capture is never emitted.
  maskingCaptureStages.forEach(({ description, deferCapture }) => {
    for (const [privacyLevel, masked] of privacyLevels) {
      if (privacyLevel === NodePrivacyLevel.ALLOW) {
        continue // the canvas already has the allow privacy level by default
      }

      it(`${masked ? 'does not emit' : 'emits'} a snapshot when the canvas privacy level becomes ${privacyLevel} ${description}`, async () => {
        const resumeCapture = deferCapture()
        draw('red')
        const onCanvasCapture = startTracking()
        markCanvasDirtyAndWaitForCapture()
        await waitForCanvasCapture()

        canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
        resumeCapture()
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
