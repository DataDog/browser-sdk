import { registerCleanupTask } from '@datadog/browser-core/test'
import type { Tracker } from './tracker.types'
import { trackCanvas2DMutations } from './trackCanvas'

describe('trackCanvas2DMutations', () => {
  let canvas: HTMLCanvasElement
  let context: CanvasRenderingContext2D
  let markCanvasDirtySpy: jasmine.Spy<(canvas: HTMLCanvasElement) => void>
  let tracker: Tracker | undefined

  beforeEach(() => {
    canvas = document.createElement('canvas')
    context = canvas.getContext('2d')!
    markCanvasDirtySpy = jasmine.createSpy()

    registerCleanupTask(() => tracker?.stop())
  })

  it('marks the canvas dirty after drawing operations', () => {
    tracker = trackCanvas2DMutations(markCanvasDirtySpy)
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
    tracker = trackCanvas2DMutations(markCanvasDirtySpy)

    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('does not mark the canvas dirty when a drawing operation throws', () => {
    tracker = trackCanvas2DMutations(markCanvasDirtySpy)

    expect(() => context.putImageData(null as unknown as ImageData, 0, 0)).toThrow()
    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })

  it('stops tracking canvas mutations', () => {
    tracker = trackCanvas2DMutations(markCanvasDirtySpy)
    tracker.stop()

    context.fillRect(0, 0, 1, 1)

    expect(markCanvasDirtySpy).not.toHaveBeenCalled()
  })
})
