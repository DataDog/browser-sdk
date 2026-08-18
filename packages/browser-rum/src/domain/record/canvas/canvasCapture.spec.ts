import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { collectAsyncCalls, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { ONE_SECOND } from '@datadog/js-core/time'
import type {
  CanvasCaptureConfiguration,
  CanvasCapture,
  ComputeCanvasBlobHash,
  ComputeCanvasImageHash,
  EmitCanvasImage,
} from './canvasCapture'
import { captureCanvasImage, computeCanvasBlobHash, computeCanvasImageHash, startCanvasCapture } from './canvasCapture'
import { createCanvasManager } from './canvasManager'

describe('startCanvasCapture', () => {
  const configuration: CanvasCaptureConfiguration = {
    defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
    imageFormat: 'image/webp',
    maxCaptureDimension: 1000,
    maxFramesPerSecond: 1,
    maxHashDimension: 100,
  }

  let canvas: HTMLCanvasElement
  let canvasManager: ReturnType<typeof createCanvasManager>
  let clock: Clock
  let computeBlobHashSpy: jasmine.Spy<ComputeCanvasBlobHash>
  let computeImageHashSpy: jasmine.Spy<ComputeCanvasImageHash>
  let emitCanvasImageSpy: jasmine.Spy<EmitCanvasImage>
  let imageBlob: Blob
  let toBlobSpy: jasmine.Spy<HTMLCanvasElement['toBlob']>
  let tracker: CanvasCapture | undefined

  beforeEach(() => {
    canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    canvasManager = createCanvasManager()
    clock = mockClock()
    imageBlob = new Blob(['frame'], { type: 'image/webp' })
    computeBlobHashSpy = jasmine.createSpy().and.resolveTo('blob-hash')
    computeImageHashSpy = jasmine.createSpy().and.returnValue('frame-hash')
    emitCanvasImageSpy = jasmine.createSpy()
    toBlobSpy = spyOn(canvas, 'toBlob').and.callFake((callback) => callback(imageBlob))

    registerCleanupTask(() => {
      tracker?.stop()
      canvas.remove()
    })
  })

  it('captures dirty canvases at the configured maximum frame rate', () => {
    tracker = startCanvasCapture(
      canvasManager,
      { ...configuration, maxFramesPerSecond: 2 },
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)

    clock.tick(499)
    expect(toBlobSpy).not.toHaveBeenCalled()

    clock.tick(1)

    expect(computeImageHashSpy).toHaveBeenCalledOnceWith(canvas, 100)
    expect(toBlobSpy).toHaveBeenCalledOnceWith(jasmine.any(Function), 'image/webp')
    expect(emitCanvasImageSpy).toHaveBeenCalledOnceWith({
      blob: imageBlob,
      canvas,
      hash: 'frame-hash',
    })
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not schedule captures when the maximum frame rate is zero', () => {
    tracker = startCanvasCapture(
      canvasManager,
      { ...configuration, maxFramesPerSecond: 0 },
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)

    clock.tick(10 * ONE_SECOND)

    expect(computeImageHashSpy).not.toHaveBeenCalled()
    expect(toBlobSpy).not.toHaveBeenCalled()

    tracker.stop()
    expect(canvasManager.getDirtyCanvases()).toEqual([])
  })

  it('does not create a blob when a dirty canvas hash has not changed', () => {
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(computeImageHashSpy).toHaveBeenCalledTimes(2)
    expect(toBlobSpy).toHaveBeenCalledTimes(1)
    expect(emitCanvasImageSpy).toHaveBeenCalledTimes(1)
  })

  it('does not read canvas pixels when the default privacy level is mask', () => {
    tracker = startCanvasCapture(
      canvasManager,
      { ...configuration, defaultPrivacyLevel: DefaultPrivacyLevel.MASK },
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(computeImageHashSpy).not.toHaveBeenCalled()
    expect(toBlobSpy).not.toHaveBeenCalled()
  })

  for (const privacyLevel of [DefaultPrivacyLevel.MASK, DefaultPrivacyLevel.MASK_UNLESS_ALLOWLISTED, 'hidden']) {
    it(`does not read canvas pixels under a ${privacyLevel} ancestor`, () => {
      const parent = document.createElement('div')
      parent.setAttribute('data-dd-privacy', privacyLevel)
      canvas.parentNode!.insertBefore(parent, canvas)
      parent.appendChild(canvas)
      registerCleanupTask(() => parent.remove())

      tracker = startCanvasCapture(
        canvasManager,
        configuration,
        emitCanvasImageSpy,
        computeImageHashSpy,
        computeBlobHashSpy
      )
      canvasManager.markCanvasDirty(canvas)
      clock.tick(ONE_SECOND)

      expect(computeImageHashSpy).not.toHaveBeenCalled()
      expect(toBlobSpy).not.toHaveBeenCalled()
    })
  }

  it('does not read canvas pixels under an ignored ancestor', () => {
    const parent = document.createElement('script')
    canvas.parentNode!.insertBefore(parent, canvas)
    parent.appendChild(canvas)
    registerCleanupTask(() => parent.remove())

    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(computeImageHashSpy).not.toHaveBeenCalled()
    expect(toBlobSpy).not.toHaveBeenCalled()
  })

  it('captures an allowed canvas under a masked ancestor', () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-dd-privacy', 'mask')
    canvas.setAttribute('data-dd-privacy', 'allow')
    canvas.parentNode!.insertBefore(parent, canvas)
    parent.appendChild(canvas)
    registerCleanupTask(() => parent.remove())

    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(emitCanvasImageSpy).toHaveBeenCalledTimes(1)
  })

  it('emits the same image again after the canvas becomes private and then allowed', () => {
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    canvas.setAttribute('data-dd-privacy', 'mask')
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    canvas.setAttribute('data-dd-privacy', 'allow')
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(emitCanvasImageSpy).toHaveBeenCalledTimes(2)
  })

  it('emits the same image again after capture state is reset', () => {
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    tracker.reset()
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(emitCanvasImageSpy).toHaveBeenCalledTimes(2)
    expect(emitCanvasImageSpy.calls.argsFor(1)[0].hash).toBe('frame-hash')
  })

  it('emits each transition when an image returns to an earlier hash', () => {
    computeImageHashSpy.and.returnValues('first-hash', 'second-hash', 'first-hash')
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    for (let index = 0; index < 3; index += 1) {
      canvasManager.markCanvasDirty(canvas)
      clock.tick(ONE_SECOND)
    }

    expect(emitCanvasImageSpy.calls.argsFor(0)[0].hash).toBe('first-hash')
    expect(emitCanvasImageSpy.calls.argsFor(1)[0].hash).toBe('second-hash')
    expect(emitCanvasImageSpy.calls.argsFor(2)[0].hash).toBe('first-hash')
  })

  it('keeps changes made while an image capture is in progress dirty', () => {
    const blobCallbacks: BlobCallback[] = []
    computeImageHashSpy.and.returnValues('first-hash', 'second-hash')
    toBlobSpy.and.callFake((callback) => blobCallbacks.push(callback))
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(toBlobSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    blobCallbacks[0](imageBlob)
    clock.tick(ONE_SECOND)

    expect(toBlobSpy).toHaveBeenCalledTimes(2)
  })

  it('falls back to hashing blob bytes when pixels cannot be read', async () => {
    computeImageHashSpy.and.returnValue(undefined)
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)
    const emittedImage = collectAsyncCalls(emitCanvasImageSpy)

    clock.tick(ONE_SECOND)
    await emittedImage

    expect(computeBlobHashSpy).toHaveBeenCalledOnceWith(imageBlob)
    expect(emitCanvasImageSpy).toHaveBeenCalledOnceWith({ blob: imageBlob, canvas, hash: 'blob-hash' })
  })

  it('ignores captures that do not produce a blob', () => {
    toBlobSpy.and.callFake((callback) => callback(null))
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)

    clock.tick(ONE_SECOND)

    expect(emitCanvasImageSpy).not.toHaveBeenCalled()
  })

  it('ignores a pending capture after stopping', () => {
    let blobCallback: BlobCallback | undefined
    toBlobSpy.and.callFake((callback) => {
      blobCallback = callback
    })
    tracker = startCanvasCapture(
      canvasManager,
      configuration,
      emitCanvasImageSpy,
      computeImageHashSpy,
      computeBlobHashSpy
    )
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    tracker.stop()
    blobCallback!(imageBlob)

    expect(emitCanvasImageSpy).not.toHaveBeenCalled()
    expect(canvasManager.getDirtyCanvases()).toEqual([])
  })
})

describe('computeCanvasImageHash', () => {
  it('returns the same hash for the same pixels and a different hash when pixels change', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 1
    const context = canvas.getContext('2d')!

    context.fillStyle = 'red'
    context.fillRect(0, 0, 2, 1)
    const firstHash = computeCanvasImageHash(canvas, 100)
    const unchangedHash = computeCanvasImageHash(canvas, 100)

    context.fillStyle = 'white'
    context.fillRect(0, 0, 1, 1)

    expect(unchangedHash).toBe(firstHash)
    expect(computeCanvasImageHash(canvas, 100)).not.toBe(firstHash)
  })

  it('bounds the thumbnail by the configured maximum dimension', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    const drawImageSpy = spyOn(CanvasRenderingContext2D.prototype, 'drawImage').and.callThrough()

    computeCanvasImageHash(canvas, 50)

    expect(drawImageSpy.calls.mostRecent().args).toEqual([canvas, 0, 0, 50, 25])
  })
})

describe('captureCanvasImage', () => {
  it('downscales captured images independently from hash thumbnails', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2000
    canvas.height = 1000
    const imageBlob = new Blob(['frame'], { type: 'image/png' })
    const toBlobSpy = spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake((callback) => callback(imageBlob))
    const callbackSpy = jasmine.createSpy<BlobCallback>()

    captureCanvasImage(canvas, 1000, 'image/png', callbackSpy)

    const capturedCanvas = toBlobSpy.calls.mostRecent().object as HTMLCanvasElement
    expect(capturedCanvas.width).toBe(1000)
    expect(capturedCanvas.height).toBe(500)
    expect(callbackSpy).toHaveBeenCalledOnceWith(imageBlob)
  })
})

describe('computeCanvasBlobHash', () => {
  it('computes a non-cryptographic hash from blob bytes', async () => {
    expect(await computeCanvasBlobHash(new Blob(['hello']))).toBe('4f9f2cab')
  })
})
