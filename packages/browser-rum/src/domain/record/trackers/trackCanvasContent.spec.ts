import { registerCleanupTask } from '@datadog/browser-core/test'
import type { CanvasManager } from '../canvas/canvasManager'
import { createCanvasManager } from '../canvas/canvasManager'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { Tracker } from './tracker.types'
import { trackCanvasContent } from './trackCanvasContent'

describe('trackCanvasContent', () => {
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D
  let markCanvasDirtySpy: jasmine.Spy<(canvas: HTMLCanvasElement) => void>
  let canvasManager: CanvasManager
  let tracker: Tracker | undefined

  beforeEach(() => {
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d')!
    markCanvasDirtySpy = jasmine.createSpy()
    canvasManager = { ...createCanvasManager(), markCanvasDirty: markCanvasDirtySpy }

    registerCleanupTask(() => tracker?.stop())
  })

  function startTracking(enable = true, maxFramesPerSecond = 1, hashingMaxDimension = 100, maxImageDimension = 100): Tracker {
    const scope = createRecordingScopeForTesting({
      canvasManager,
      configuration: { sessionReplayCanvasRecording: { enable, maxFramesPerSecond, hashingMaxDimension, maxImageDimension } },
    })
    scope.nodeIds.getOrInsert(canvas)
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
        expect(markCanvasDirtySpy).toHaveBeenCalledOnceWith(canvas)
      })
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
      configuration: { sessionReplayCanvasRecording: { enable: true, maxFramesPerSecond: 1, hashingMaxDimension: 100, maxImageDimension: 100 } },
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
