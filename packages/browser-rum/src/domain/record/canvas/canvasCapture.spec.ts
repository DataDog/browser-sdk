import { collectAsyncCalls, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { Tracker } from '../trackers'
import { createCanvasManager } from './canvasManager'
import type { ComputeCanvasImageHash, EmitCanvasImage } from './canvasCapture'
import { computeCanvasImageHash, startCanvasCapture } from './canvasCapture'

describe('startCanvasCapture', () => {
  let canvas: HTMLCanvasElement
  let canvasManager: ReturnType<typeof createCanvasManager>
  let clock: Clock
  let computeImageHashSpy: jasmine.Spy<ComputeCanvasImageHash>
  let emitCanvasImageSpy: jasmine.Spy<EmitCanvasImage>
  let imageBlob: Blob
  let toBlobSpy: jasmine.Spy<HTMLCanvasElement['toBlob']>
  let tracker: Tracker | undefined

  beforeEach(() => {
    canvas = document.createElement('canvas')
    canvasManager = createCanvasManager()
    clock = mockClock()
    imageBlob = new Blob(['frame'], { type: 'image/png' })
    computeImageHashSpy = jasmine.createSpy().and.resolveTo('frame-hash')
    emitCanvasImageSpy = jasmine.createSpy()
    toBlobSpy = spyOn(canvas, 'toBlob').and.callFake((callback) => callback(imageBlob))

    registerCleanupTask(() => tracker?.stop())
  })

  it('captures dirty canvases at the configured maximum frame rate', async () => {
    tracker = startCanvasCapture(canvasManager, 2, emitCanvasImageSpy, computeImageHashSpy)
    canvasManager.markCanvasDirty(canvas)

    clock.tick(499)
    expect(toBlobSpy).not.toHaveBeenCalled()

    clock.tick(1)
    await collectAsyncCalls(emitCanvasImageSpy)

    expect(toBlobSpy).toHaveBeenCalledOnceWith(jasmine.any(Function), 'image/png')
    expect(emitCanvasImageSpy).toHaveBeenCalledOnceWith({
      blob: imageBlob,
      canvas,
      hash: 'frame-hash',
    })
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })

  it('does not capture clean canvases', () => {
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)

    clock.tick(ONE_SECOND)

    expect(toBlobSpy).not.toHaveBeenCalled()
  })

  it('skips a captured image when its hash has not changed', async () => {
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)
    await collectAsyncCalls(emitCanvasImageSpy)

    canvasManager.markCanvasDirty(canvas)
    const secondHash = collectAsyncCalls(computeImageHashSpy, 2)
    clock.tick(ONE_SECOND)
    await secondHash
    await Promise.resolve()

    expect(toBlobSpy).toHaveBeenCalledTimes(2)
    expect(emitCanvasImageSpy).toHaveBeenCalledTimes(1)
  })

  it('emits each transition when an image returns to an earlier hash', async () => {
    computeImageHashSpy.and.resolveTo('first-hash')
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)
    await collectAsyncCalls(emitCanvasImageSpy)

    computeImageHashSpy.and.resolveTo('second-hash')
    canvasManager.markCanvasDirty(canvas)
    const secondImage = collectAsyncCalls(emitCanvasImageSpy, 2)
    clock.tick(ONE_SECOND)
    await secondImage

    computeImageHashSpy.and.resolveTo('first-hash')
    canvasManager.markCanvasDirty(canvas)
    const thirdImage = collectAsyncCalls(emitCanvasImageSpy, 3)
    clock.tick(ONE_SECOND)
    await thirdImage

    expect(emitCanvasImageSpy.calls.argsFor(1)[0].hash).toBe('second-hash')
    expect(emitCanvasImageSpy.calls.argsFor(2)[0].hash).toBe('first-hash')
  })

  it('keeps changes made while an image capture is in progress dirty', async () => {
    let resolveHash!: (hash: string) => void
    computeImageHashSpy.and.returnValue(new Promise((resolve) => (resolveHash = resolve)))
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)

    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)
    canvasManager.markCanvasDirty(canvas)
    clock.tick(ONE_SECOND)

    expect(toBlobSpy).toHaveBeenCalledTimes(1)
    expect(canvasManager.isCanvasDirty(canvas)).toBeTrue()

    resolveHash('first-hash')
    await collectAsyncCalls(emitCanvasImageSpy)
    await Promise.resolve()
    clock.tick(ONE_SECOND)

    expect(toBlobSpy).toHaveBeenCalledTimes(2)
  })

  it('ignores captures that do not produce a blob', () => {
    toBlobSpy.and.callFake((callback) => callback(null))
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)
    canvasManager.markCanvasDirty(canvas)

    clock.tick(ONE_SECOND)

    expect(computeImageHashSpy).not.toHaveBeenCalled()
    expect(emitCanvasImageSpy).not.toHaveBeenCalled()
  })

  it('stops capturing images and clears dirty canvases', () => {
    tracker = startCanvasCapture(canvasManager, 1, emitCanvasImageSpy, computeImageHashSpy)
    canvasManager.markCanvasDirty(canvas)

    tracker.stop()
    clock.tick(ONE_SECOND)

    expect(toBlobSpy).not.toHaveBeenCalled()
    expect(canvasManager.isCanvasDirty(canvas)).toBeFalse()
  })
})

describe('computeCanvasImageHash', () => {
  it('computes a SHA-256 hash from the image bytes', async () => {
    expect(await computeCanvasImageHash(new Blob(['hello']))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
  })
})
