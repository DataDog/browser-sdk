import { globalObject } from '@datadog/js-core/util'
import { timeStampNow } from '@datadog/js-core/time'
import {
  collectAsyncCalls,
  registerCleanupTask,
  mockClock,
  replaceMockable,
  startMockTelemetry,
  waitAfterNextPaint,
} from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { NodePrivacyLevel, PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import { ChangeType } from '../../../types'
import type { CanvasManager } from '../canvas/canvasManager'
import { CanvasStatus, createCanvasManager } from '../canvas/canvasManager'
import { expectPixelApprox } from '../canvas/canvasImage.specHelper'
import { createCanvasSnapshot } from '../canvas/canvasSnapshot'
import { isCanvasWorkerSupported } from '../canvas/canvasWorker'
import { mockCanvasWorker } from '../../../../test'
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
  let convertToBlobSpy: jasmine.Spy
  let emitRecord: jasmine.Spy<EmitRecordCallback>
  let canvasWorkerMock: ReturnType<typeof mockCanvasWorker>
  let stopCanvasContentTrackingSpy: jasmine.Spy

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
    if (!isCanvasWorkerSupported()) {
      pending('canvas recording not supported')
    }
    clock = mockClock()
    canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    canvasContext = canvas.getContext('2d')!
    canvasManager = createCanvasManager()
    document.body.appendChild(canvas)
    convertToBlobSpy = spyOn(OffscreenCanvas.prototype, 'convertToBlob').and.callFake(() =>
      Promise.resolve(new Blob([], { type: 'image/webp' }))
    )

    canvasWorkerMock = mockCanvasWorker()
    stopCanvasContentTrackingSpy = jasmine.createSpy()

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
    tracker = trackCanvasCapture(
      scope,
      () => {
        serializeMutations(timeStampNow(), [], emitRecord, emitResource, jasmine.createSpy<EmitStatsCallback>(), scope)
      },
      stopCanvasContentTrackingSpy
    )
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
    await collectAsyncCalls(onCanvasCapture, 1)

    expect(onCanvasCapture).toHaveBeenCalledOnceWith(jasmine.any(String), jasmine.any(Blob), jasmine.any(Function))
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('looks up the node ID before reading canvas pixels', async () => {
    const createImageBitmapSpy = spyOn(window, 'createImageBitmap').and.callThrough()
    startTracking()
    scope.nodeIds.delete(canvas)

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(createImageBitmapSpy).not.toHaveBeenCalled()
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
    const onDiscard = onCanvasCapture.calls.argsFor(0)[2] as () => void
    onDiscard()

    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 2)

    expect(onCanvasCapture.calls.argsFor(1)[0]).toBe(onCanvasCapture.calls.argsFor(0)[0])
  })

  it('hashes and emits the same immutable canvas snapshot', async () => {
    let resolveFirstDigest!: () => void
    let onFirstDigest!: () => void
    const firstDigestReached = new Promise<void>((resolve) => (onFirstDigest = resolve))
    let isFirstDigest = true
    const digestSpy = jasmine.createSpy().and.callFake((_algorithm: AlgorithmIdentifier, data: BufferSource) => {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data)
      const result = Uint8Array.of(bytes[0]).buffer

      if (isFirstDigest) {
        isFirstDigest = false
        onFirstDigest()
        return new Promise<ArrayBuffer>((resolve) => {
          resolveFirstDigest = () => resolve(result)
        })
      }
      return Promise.resolve(result)
    })
    replaceMockable(globalObject.crypto?.subtle, { digest: digestSpy } as unknown as SubtleCrypto)
    // The emitted image is the assertion here, so it has to be a real WebP rather than the empty
    // blob the suite stubs in.
    convertToBlobSpy.and.callThrough()

    draw('red')
    const onCanvasCapture = startTracking()
    markCanvasDirtyAndWaitForCapture()
    await firstDigestReached
    draw('blue')
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    resolveFirstDigest()
    await collectAsyncCalls(onCanvasCapture, 1)
    await waitForCanvasCapture()

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[1]), [255, 0, 0, 255])
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 2)

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(1)[1]), [0, 0, 255, 255])
    expect(onCanvasCapture.calls.argsFor(1)[0]).not.toBe(onCanvasCapture.calls.argsFor(0)[0])
  })

  it('uses a WebGL snapshot captured before its drawing buffer is discarded', async () => {
    convertToBlobSpy.and.callThrough()
    draw('red')
    const snapshot = createCanvasSnapshot(canvas, 1000)
    const onCanvasCapture = startTracking()
    canvasManager.setCanvasSnapshot(canvas, snapshot)

    draw('blue')
    markCanvasDirtyAndWaitForCapture()
    await collectAsyncCalls(onCanvasCapture, 1)

    expectPixelApprox(await firstPixelOf(onCanvasCapture.calls.argsFor(0)[1]), [255, 0, 0, 255])
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
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    clock.tick(1000)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
  })

  interface DeferredCapture {
    reached: Promise<void>
    resume: () => void
  }

  // Defers the first call of a stage, and resolves `reached` when the capture gets there
  function deferFirstCall<T>(nextValue: () => T): {
    reached: Promise<void>
    resume: () => void
    fake: () => Promise<T>
  } {
    let onReached!: () => void
    const reached = new Promise<void>((resolve) => (onReached = resolve))
    let resume!: () => void
    const firstCall = new Promise<T>((resolve) => (resume = () => resolve(nextValue())))
    let isFirstCall = true
    const fake = () => {
      if (isFirstCall) {
        isFirstCall = false
        onReached()
        return firstCall
      }
      return Promise.resolve(nextValue())
    }
    return { reached, resume, fake }
  }

  function deferFirstDigest(): DeferredCapture {
    const { reached, resume, fake } = deferFirstCall(() => new ArrayBuffer(32))
    replaceMockable(globalObject.crypto?.subtle, { digest: fake } as unknown as SubtleCrypto)
    return { reached, resume }
  }

  function deferFirstBlob(): DeferredCapture {
    const { reached, resume, fake } = deferFirstCall(() => new Blob([], { type: 'image/webp' }))
    convertToBlobSpy.and.callFake(fake)
    return { reached, resume }
  }

  const nodeIdChangeCaptureStages: Array<{ description: string; deferCapture: () => DeferredCapture }> = [
    { description: 'while hashing', deferCapture: deferFirstDigest },
    { description: 'while encoding', deferCapture: deferFirstBlob },
  ]

  nodeIdChangeCaptureStages.forEach(({ description, deferCapture }) => {
    it(`discards an in-flight capture when the canvas receives a new node ID ${description}`, async () => {
      const { reached, resume } = deferCapture()
      draw('red')
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()
      await reached

      const currentNodeId = replaceCanvasWithNewNodeId()
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
      resume()
      await waitForCanvasCapture()

      expect(onCanvasCapture).not.toHaveBeenCalled()

      clock.tick(1000)
      await collectAsyncCalls(onCanvasCapture, 1)

      expect(onCanvasCapture).toHaveBeenCalledOnceWith(jasmine.any(String), jasmine.any(Blob), jasmine.any(Function))
      expect(emitRecord.calls.argsFor(0)[0]).toEqual(
        jasmine.objectContaining({
          data: jasmine.arrayContaining([[ChangeType.ImageContent, [currentNodeId, jasmine.any(Number)]]]),
        })
      )
    })
  })

  it('leaves the canvas dirty when emitting the canvas resource fails', async () => {
    draw('red')
    const onCanvasCapture = jasmine.createSpy<EmitResourceCallback>().and.throwError('resource failed')
    startTracking(onCanvasCapture)

    markCanvasDirtyAndWaitForCapture()
    await collectAsyncCalls(onCanvasCapture, 1)
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
    await collectAsyncCalls(onCanvasCapture, 1)
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('leaves the canvas dirty when hashing is unavailable', async () => {
    const getContextSpy = spyOn(OffscreenCanvas.prototype, 'getContext').and.returnValue(null)
    const onCanvasCapture = startTracking()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    clock.tick(1000)
    await collectAsyncCalls(getContextSpy, 1)
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  it('stops trying to capture a canvas when reading its pixels throws a SecurityError', async () => {
    const getImageDataSpy = spyOn(OffscreenCanvasRenderingContext2D.prototype, 'getImageData').and.throwError(
      new DOMException('canvas is tainted', 'SecurityError')
    )
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await collectAsyncCalls(getImageDataSpy, 1)
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(getImageDataSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  it('stops trying to capture a zero-sized canvas until it is resized', async () => {
    const createImageBitmapSpy = spyOn(window, 'createImageBitmap').and.callThrough()
    canvas.width = 0
    startTracking()

    markCanvasDirtyAndWaitForCapture()
    await collectAsyncCalls(createImageBitmapSpy, 1)
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([])

    canvas.width = 2
    await waitForCanvasCapture()

    expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
  })

  for (const [privacyLevel, masked] of privacyLevels) {
    it(`${masked ? 'does not capture' : 'captures'} a canvas when the privacy level is ${privacyLevel}`, async () => {
      canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
      const onCanvasCapture = startTracking()
      markCanvasDirtyAndWaitForCapture()

      if (masked) {
        await waitForCanvasCapture()
        expect(onCanvasCapture).not.toHaveBeenCalled()
        expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
      } else {
        await collectAsyncCalls(onCanvasCapture, 1)
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
    await collectAsyncCalls(onCanvasCapture, 1)

    expect(canvasManager.takeCapturableCanvases()).toEqual([])
  })

  const maskingCaptureStages: Array<{ description: string; deferCapture: () => DeferredCapture }> = [
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
        const { reached, resume } = deferCapture()
        draw('red')
        const onCanvasCapture = startTracking()
        markCanvasDirtyAndWaitForCapture()
        await reached

        canvas.setAttribute(PRIVACY_ATTR_NAME, privacyLevel)
        resume()

        if (masked) {
          await waitForCanvasCapture()
          expect(onCanvasCapture).not.toHaveBeenCalled()
          expect(canvasManager.takeCapturableCanvases()).toEqual([canvas])
        } else {
          await collectAsyncCalls(onCanvasCapture, 1)
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
    expect(canvasWorkerMock.stopSpy).toHaveBeenCalled()
  })

  it('keeps canvases dirty until the canvas worker is ready', async () => {
    canvasWorkerMock.ready = false
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()
    expect(onCanvasCapture).not.toHaveBeenCalled()

    canvasWorkerMock.ready = true
    clock.tick(1000)
    await collectAsyncCalls(onCanvasCapture, 1)
  })

  it('disables canvas recording when the browser does not support it', async () => {
    const telemetry = startMockTelemetry()
    replaceMockable(isCanvasWorkerSupported, () => false)
    draw('red')
    const onCanvasCapture = startTracking()

    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(stopCanvasContentTrackingSpy).toHaveBeenCalled()
    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({ message: 'Canvas recording disabled', reason: 'unsupported' }),
    ])
  })

  it('disables canvas recording when the canvas worker fails', async () => {
    const telemetry = startMockTelemetry()
    draw('red')
    const onCanvasCapture = startTracking()

    canvasWorkerMock.fail('timeout')
    markCanvasDirtyAndWaitForCapture()
    await waitForCanvasCapture()

    expect(onCanvasCapture).not.toHaveBeenCalled()
    expect(stopCanvasContentTrackingSpy).toHaveBeenCalled()
    expect(await telemetry.getEvents()).toEqual([
      jasmine.objectContaining({ message: 'Canvas recording disabled', reason: 'timeout' }),
    ])
  })
})
