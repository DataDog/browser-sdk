import { registerCleanupTask } from '@datadog/browser-core/test'
import type { CanvasManager } from '../canvas/canvasManager'
import { CanvasStatus, createCanvasManager } from '../canvas/canvasManager'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { Tracker } from './tracker.types'
import { trackCanvasContent } from './trackCanvasContent'

const WEBGL_CONTEXT_TYPES = ['webgl', 'webgl2'] as const

describe('trackCanvasContent', () => {
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D
  let markCanvasDirtySpy: jasmine.Spy<CanvasManager['markCanvas']>
  let canvasManager: CanvasManager
  let tracker: Tracker | undefined

  beforeEach(() => {
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d')!
    markCanvasDirtySpy = jasmine.createSpy()
    canvasManager = { ...createCanvasManager(), markCanvas: markCanvasDirtySpy }

    registerCleanupTask(() => tracker?.stop())
  })

  function startTracking(
    enable: boolean = true,
    maxFramesPerSecond = 1,
    hashingMaxDimension = 100,
    maxImageDimension = 1000,
    canvasToTrack = canvas
  ): Tracker {
    const scope = createRecordingScopeForTesting({
      canvasManager,
      configuration: {
        sessionReplayCanvasRecording: enable
          ? { enable: true, maxFramesPerSecond, hashingMaxDimension, maxImageDimension, encodeQuality: 0.5 }
          : undefined,
      },
    })
    scope.nodeIds.getOrInsert(canvasToTrack)
    tracker = trackCanvasContent(scope)
    return tracker
  }

  it('marks the canvas dirty after drawing operations', () => {
    startTracking()
    const imageData = context.createImageData(1, 1)
    const drawingOperations: Array<{ method: string; draw: () => void }> = [
      { method: 'clearRect', draw: () => context.clearRect(0, 0, 1, 1) },
      { method: 'fillRect', draw: () => context.fillRect(0, 0, 1, 1) },
      { method: 'strokeRect', draw: () => context.strokeRect(0, 0, 1, 1) },
      { method: 'fill', draw: () => context.fill() },
      { method: 'stroke', draw: () => context.stroke() },
      { method: 'fillText', draw: () => context.fillText('foo', 0, 0) },
      { method: 'strokeText', draw: () => context.strokeText('foo', 0, 0) },
      { method: 'drawImage', draw: () => context.drawImage(canvas, 0, 0) },
      { method: 'putImageData', draw: () => context.putImageData(imageData, 0, 0) },
      { method: 'drawFocusIfNeeded', draw: () => context.drawFocusIfNeeded(canvas) },
      { method: 'reset', draw: () => context.reset() },
    ]

    // Skip unsuported APIs per browser version.
    drawingOperations
      .filter(
        ({ method }) =>
          typeof CanvasRenderingContext2D.prototype[method as keyof CanvasRenderingContext2D] === 'function'
      )
      .forEach(({ draw }) => {
        markCanvasDirtySpy.calls.reset()
        draw()
        expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(canvas, CanvasStatus.Dirty)
      })
  })

  WEBGL_CONTEXT_TYPES.forEach((contextType) => {
    it(`marks the canvas dirty after ${contextType} drawing operations`, async () => {
      const webGLCanvas = document.createElement('canvas')
      const webGLContext = contextType === 'webgl' ? webGLCanvas.getContext('webgl') : webGLCanvas.getContext('webgl2')
      if (!webGLContext) {
        return
      }
      const setCanvasSnapshotSpy = spyOn(canvasManager, 'setCanvasSnapshot').and.callThrough()
      startTracking(true, Infinity, 100, 1000, webGLCanvas)

      const drawingOperations = [
        () => webGLContext.clear(webGLContext.COLOR_BUFFER_BIT),
        () => webGLContext.drawArrays(webGLContext.POINTS, 0, 0),
        () => webGLContext.drawElements(webGLContext.POINTS, 0, webGLContext.UNSIGNED_SHORT, 0),
      ]

      for (const draw of drawingOperations) {
        markCanvasDirtySpy.calls.reset()
        setCanvasSnapshotSpy.calls.reset()
        draw()
        await Promise.resolve()

        expect(setCanvasSnapshotSpy).toHaveBeenCalledOnceWith(webGLCanvas, jasmine.any(Object))
        expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(webGLCanvas, CanvasStatus.Dirty)
      }
    })
  })

  it('takes a single WebGL snapshot for drawing operations in the same task', async () => {
    const webGLCanvas = document.createElement('canvas')
    const webGLContext = webGLCanvas.getContext('webgl')
    if (!webGLContext) {
      return
    }
    const setCanvasSnapshotSpy = spyOn(canvasManager, 'setCanvasSnapshot').and.callThrough()
    startTracking(true, 1, 100, 1000, webGLCanvas)

    webGLContext.clear(webGLContext.COLOR_BUFFER_BIT)
    webGLContext.drawArrays(webGLContext.POINTS, 0, 0)
    webGLContext.drawElements(webGLContext.POINTS, 0, webGLContext.UNSIGNED_SHORT, 0)
    await Promise.resolve()

    expect(setCanvasSnapshotSpy).toHaveBeenCalledTimes(1)
    expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(webGLCanvas, CanvasStatus.Dirty)
  })

  it('marks the canvas dirty after WebGL2 drawing operations', async () => {
    const webGLCanvas = document.createElement('canvas')
    const webGLContext = webGLCanvas.getContext('webgl2')
    if (!webGLContext) {
      return
    }
    startTracking(true, Infinity, 100, 1000, webGLCanvas)

    const drawingOperations = [
      () => webGLContext.blitFramebuffer(0, 0, 1, 1, 0, 0, 1, 1, webGLContext.COLOR_BUFFER_BIT, webGLContext.NEAREST),
      () => webGLContext.clearBufferfi(webGLContext.DEPTH_STENCIL, 0, 1, 0),
      () => webGLContext.clearBufferfv(webGLContext.COLOR, 0, [0, 0, 0, 0]),
      () => webGLContext.clearBufferiv(webGLContext.COLOR, 0, [0, 0, 0, 0]),
      () => webGLContext.clearBufferuiv(webGLContext.COLOR, 0, [0, 0, 0, 0]),
      () => webGLContext.drawArraysInstanced(webGLContext.POINTS, 0, 0, 0),
      () => webGLContext.drawElementsInstanced(webGLContext.POINTS, 0, webGLContext.UNSIGNED_SHORT, 0, 0),
      () => webGLContext.drawRangeElements(webGLContext.POINTS, 0, 0, 0, webGLContext.UNSIGNED_SHORT, 0),
    ]

    for (const draw of drawingOperations) {
      markCanvasDirtySpy.calls.reset()
      draw()
      await Promise.resolve()

      expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(webGLCanvas, CanvasStatus.Dirty)
    }
  })

  it('marks the canvas dirty after ANGLE instanced drawing operations', async () => {
    const webGLCanvas = document.createElement('canvas')
    const webGLContext = webGLCanvas.getContext('webgl')
    if (!webGLContext) {
      return
    }
    startTracking(true, Infinity, 100, 1000, webGLCanvas)
    const extension = webGLContext.getExtension('ANGLE_instanced_arrays')
    if (!extension) {
      return
    }

    const drawingOperations = [
      () => extension.drawArraysInstancedANGLE(webGLContext.POINTS, 0, 0, 0),
      () => extension.drawElementsInstancedANGLE(webGLContext.POINTS, 0, webGLContext.UNSIGNED_SHORT, 0, 0),
    ]

    for (const draw of drawingOperations) {
      markCanvasDirtySpy.calls.reset()
      draw()
      await Promise.resolve()

      expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(webGLCanvas, CanvasStatus.Dirty)
    }
  })

  it('marks the canvas dirty after WebGL multi-draw operations', async () => {
    const webGLCanvas = document.createElement('canvas')
    const webGLContext = webGLCanvas.getContext('webgl2')
    if (!webGLContext) {
      return
    }
    startTracking(true, Infinity, 100, 1000, webGLCanvas)
    const extension = webGLContext.getExtension('WEBGL_multi_draw')
    if (!extension) {
      return
    }
    const values = new Int32Array()

    const drawingOperations = [
      () => extension.multiDrawArraysWEBGL(webGLContext.POINTS, values, 0, values, 0, 0),
      () => extension.multiDrawElementsWEBGL(webGLContext.POINTS, values, 0, webGLContext.UNSIGNED_SHORT, values, 0, 0),
      () => extension.multiDrawArraysInstancedWEBGL(webGLContext.POINTS, values, 0, values, 0, values, 0, 0),
      () =>
        extension.multiDrawElementsInstancedWEBGL(
          webGLContext.POINTS,
          values,
          0,
          webGLContext.UNSIGNED_SHORT,
          values,
          0,
          values,
          0,
          0
        ),
    ]

    for (const draw of drawingOperations) {
      markCanvasDirtySpy.calls.reset()
      draw()
      await Promise.resolve()

      expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(webGLCanvas, CanvasStatus.Dirty)
    }
  })

  it('freezes WebGL content while the drawing buffer is available', async () => {
    const webGLCanvas = document.createElement('canvas')
    webGLCanvas.width = 1
    webGLCanvas.height = 1
    const webGLContext = webGLCanvas.getContext('webgl', { preserveDrawingBuffer: false })
    if (!webGLContext) {
      return
    }
    startTracking(true, 1, 100, 1000, webGLCanvas)

    webGLContext.clearColor(1, 0, 0, 1)
    webGLContext.clear(webGLContext.COLOR_BUFFER_BIT)
    await Promise.resolve()

    const snapshot = canvasManager.startCaptureAttempt(webGLCanvas).snapshot!
    expect(Array.from(snapshot.source.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255])
  })

  it('does not mark the canvas dirty for non-drawing operations', () => {
    startTracking()

    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('does not mark an unserialized canvas dirty', () => {
    const scope = createRecordingScopeForTesting({
      canvasManager,
      configuration: {
        sessionReplayCanvasRecording: {
          enable: true,
          maxFramesPerSecond: 1,
          hashingMaxDimension: 100,
          maxImageDimension: 1000,
          encodeQuality: 0.5,
        },
      },
    })
    tracker = trackCanvasContent(scope)

    context.fillRect(0, 0, 1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('does not mark the canvas dirty when a drawing operation throws', () => {
    startTracking()

    expect(() => context.putImageData(null as unknown as ImageData, 0, 0)).toThrow()
    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('restores the original behavior when stopped', () => {
    startTracking().stop()

    context.fillRect(0, 0, 1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('does not track canvas content when canvas recording is disabled', () => {
    startTracking(false)

    context.fillRect(0, 0, 1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('does not track canvas content when the maximum frame rate is zero', () => {
    startTracking(true, 0)

    context.fillRect(0, 0, 1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })
})
