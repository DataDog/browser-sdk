import { registerCleanupTask } from '@datadog/browser-core/test'
import { CanvasStatus, createCanvasManager } from './canvasManager'
import type { CanvasCaptureAttempt } from './canvasManager'

describe('CanvasManager', () => {
  it('tracks whether a canvas is capturable', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    expect(canvasManager.getCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])

    canvasManager.markCanvas(canvas, CanvasStatus.Clean)
    expect(canvasManager.getCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  it('tracks canvases independently', () => {
    const canvasManager = createCanvasManager()
    const dirtyCanvas = appendCanvas()
    const cleanCanvas = appendCanvas()

    canvasManager.markCanvas(dirtyCanvas, CanvasStatus.Dirty)

    expect(canvasManager.getCapturableCanvases()).toEqual([dirtyCanvas])
    expect(canvasManager.getCapturableCanvases().includes(cleanCanvas)).toBe(false)
  })

  it('does not retain detached canvases', () => {
    const canvasManager = createCanvasManager()
    const canvas = document.createElement('canvas')

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    expect(canvasManager.getCapturableCanvases()).toEqual([])

    document.body.appendChild(canvas)
    registerCleanupTask(() => canvas.remove())
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('does not return tainted canvases for capture', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    expect(canvasManager.getCapturableCanvases()).toEqual([])
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('does not start a capture for a tainted canvas', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    const run = jasmine.createSpy().and.returnValue(Promise.resolve())
    await canvasManager.capture(canvas, run)

    expect(run).not.toHaveBeenCalled()
  })

  it('does not start a second capture while one is in flight', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    let resolveFirst!: () => void
    const firstCapture = canvasManager.capture(
      canvas,
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    await Promise.resolve()

    expect(canvasManager.getCapturableCanvases()).toEqual([])

    const secondRun = jasmine.createSpy().and.returnValue(Promise.resolve())
    await canvasManager.capture(canvas, secondRun)
    expect(secondRun).not.toHaveBeenCalled()

    resolveFirst()
    await firstCapture
  })

  it('releases the in-flight capture once the attempt settles', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    let attempt!: CanvasCaptureAttempt
    await canvasManager.capture(canvas, (currentAttempt) => {
      attempt = currentAttempt
      return Promise.resolve()
    })

    expect(attempt.isCurrent()).toBeFalse()
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  it('marks the canvas clean when the attempt settles without a draw in between', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    await canvasManager.capture(canvas, (attempt) => {
      attempt.settle('hash')
      return Promise.resolve()
    })

    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('keeps the canvas dirty when a draw happens while the attempt is in flight', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    await canvasManager.capture(canvas, (attempt) => {
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
      attempt.settle('hash')
      return Promise.resolve()
    })

    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  it('exposes the changeHash emitted by the previous attempt', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    await canvasManager.capture(canvas, (attempt) => {
      expect(attempt.lastChangeHash).toBeUndefined()
      attempt.settle('hash')
      return Promise.resolve()
    })

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    let lastChangeHash: string | undefined
    await canvasManager.capture(canvas, (attempt) => {
      lastChangeHash = attempt.lastChangeHash
      return Promise.resolve()
    })

    expect(lastChangeHash).toBe('hash')
  })

  it('leaves the canvas dirty when the attempt fails with a non-security error', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

    await canvasManager.capture(canvas, (attempt) => {
      attempt.fail(new Error('boom'))
      return Promise.resolve()
    })

    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])
  })

  const securityErrorFailureModes: Array<{
    description: string
    run: (attempt: CanvasCaptureAttempt) => Promise<void>
  }> = [
    {
      description: 'when the attempt fails with a SecurityError',
      run: (attempt) => {
        attempt.fail(new DOMException('tainted', 'SecurityError'))
        return Promise.resolve()
      },
    },
    {
      description: 'when the run callback rejects with a SecurityError',
      run: () => Promise.reject(new DOMException('tainted', 'SecurityError')),
    },
  ]

  securityErrorFailureModes.forEach(({ description, run }) => {
    it(`taints the canvas ${description}`, async () => {
      const canvasManager = createCanvasManager()
      const canvas = appendCanvas()
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)

      await canvasManager.capture(canvas, run)

      expect(canvasManager.getCapturableCanvases()).toEqual([])
      canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
      expect(canvasManager.getCapturableCanvases()).toEqual([])
    })
  })

  it('discards the in-flight capture and the last hash when the bitmap is reset', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    let attempt!: CanvasCaptureAttempt
    // Fire-and-forget: this capture is meant to stay in flight for the rest of the test.
    void canvasManager.capture(canvas, (currentAttempt) => {
      attempt = currentAttempt
      attempt.settle('hash')
      return new Promise(() => {
        // never resolves: simulates a capture still in flight
      })
    })
    await Promise.resolve()

    canvasManager.resetCanvasBitmap(canvas)

    expect(attempt.isCurrent()).toBeFalse()
    expect(canvasManager.getCapturableCanvases()).toEqual([canvas])

    let lastChangeHash: string | undefined
    await canvasManager.capture(canvas, (currentAttempt) => {
      lastChangeHash = currentAttempt.lastChangeHash
      return Promise.resolve()
    })
    expect(lastChangeHash).toBeUndefined()
  })

  it('keeps a tainted canvas tainted after its bitmap is reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    canvasManager.resetCanvasBitmap(canvas)

    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('forgets capture state but keeps the taint when a canvas node is removed', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    let attempt!: CanvasCaptureAttempt
    // Fire-and-forget: this capture is meant to stay in flight for the rest of the test.
    void canvasManager.capture(canvas, (currentAttempt) => {
      attempt = currentAttempt
      attempt.settle('hash')
      return new Promise(() => {
        // never resolves: simulates a capture still in flight
      })
    })
    await Promise.resolve()
    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    canvasManager.forgetCanvas(canvas)

    expect(attempt.isCurrent()).toBeFalse()
    expect(canvasManager.getCapturableCanvases()).toEqual([])

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })

  it('resets capture hashes', async () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    await canvasManager.capture(canvas, (attempt) => {
      attempt.settle('hash')
      return Promise.resolve()
    })

    canvasManager.reset()

    let lastChangeHash: string | undefined
    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    await canvasManager.capture(canvas, (attempt) => {
      lastChangeHash = attempt.lastChangeHash
      return Promise.resolve()
    })
    expect(lastChangeHash).toBeUndefined()
  })

  it('does not forget tainted canvases on reset', () => {
    const canvasManager = createCanvasManager()
    const canvas = appendCanvas()

    canvasManager.markCanvas(canvas, CanvasStatus.Tainted)

    canvasManager.reset()

    canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    expect(canvasManager.getCapturableCanvases()).toEqual([])
  })
})

function appendCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  registerCleanupTask(() => canvas.remove())
  return canvas
}
