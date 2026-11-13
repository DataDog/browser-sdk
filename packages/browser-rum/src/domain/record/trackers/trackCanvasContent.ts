import { noop } from '@datadog/js-core/util'
import { instrumentMethod } from '@datadog/browser-core'
import { getNodePrivacyLevel, shouldMaskNode } from '@datadog/browser-rum-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import type { RecordingScope } from '../recordingScope'
import { CanvasStatus } from '../canvas/canvasManager'
import { createCanvasSnapshot } from '../canvas/canvasSnapshot'
import type { Tracker } from './tracker.types'

const CANVAS_2D_DRAWING_METHODS = [
  'clearRect',
  'fillRect',
  'strokeRect',
  'fill',
  'stroke',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
  'drawFocusIfNeeded',
  'reset',
] as const

const WEBGL_DRAWING_METHODS = ['clear', 'drawArrays', 'drawElements'] as const
const WEBGL_2_DRAWING_METHODS = [
  'blitFramebuffer',
  'clearBufferfi',
  'clearBufferfv',
  'clearBufferiv',
  'clearBufferuiv',
  'drawArraysInstanced',
  'drawElementsInstanced',
  'drawRangeElements',
] as const

interface CanvasTrackingState {
  nextSnapshotTime: number
  preservesDrawingBuffer: boolean
  snapshotScheduled: boolean
}

export function trackCanvasContent(scope: RecordingScope): Tracker {
  const configuration = scope.configuration.sessionReplayCanvasRecording
  if (!configuration?.enable || configuration.maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  const instrumentationStoppers: Tracker[] = []
  const snapshotInterval = ONE_SECOND / configuration.maxFramesPerSecond
  const canvasTrackingStates = new WeakMap<HTMLCanvasElement, CanvasTrackingState>()
  // WebGPU canvases whose current texture was requested, snapshotted after the next queue submit
  const drawnWebGPUCanvases = new Set<HTMLCanvasElement>()
  let stopped = false

  const markCanvasDirty = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
    if (scope.nodeIds.get(canvas as HTMLCanvasElement) !== undefined) {
      scope.canvasManager.markCanvas(canvas as HTMLCanvasElement, CanvasStatus.Dirty)
    }
  }

  const getTrackingState = (canvas: HTMLCanvasElement, preservesDrawingBuffer: () => boolean) => {
    let trackingState = canvasTrackingStates.get(canvas)
    if (!trackingState) {
      trackingState = {
        nextSnapshotTime: -Infinity,
        preservesDrawingBuffer: preservesDrawingBuffer(),
        snapshotScheduled: false,
      }
      canvasTrackingStates.set(canvas, trackingState)
    }
    return trackingState
  }

  // Snapshots the canvas in a microtask, while its drawing buffer is still available
  const scheduleSnapshot = (htmlCanvas: HTMLCanvasElement, trackingState: CanvasTrackingState) => {
    const now = performance.now()
    if (trackingState.snapshotScheduled || now < trackingState.nextSnapshotTime) {
      return
    }

    trackingState.snapshotScheduled = true
    trackingState.nextSnapshotTime = now + snapshotInterval
    void Promise.resolve().then(() => {
      trackingState.snapshotScheduled = false
      if (stopped) {
        return
      }
      const privacyLevel = getNodePrivacyLevel(htmlCanvas, scope.configuration.defaultPrivacyLevel)
      if (shouldMaskNode(htmlCanvas, privacyLevel)) {
        return
      }

      try {
        const snapshot = createCanvasSnapshot(htmlCanvas, configuration.maxImageDimension)
        if (snapshot) {
          scope.canvasManager.setCanvasSnapshot(htmlCanvas, snapshot)
          markCanvasDirty(htmlCanvas)
        }
      } catch (error) {
        scope.canvasManager.markCanvas(
          htmlCanvas,
          error instanceof DOMException && error.name === 'SecurityError' ? CanvasStatus.Tainted : CanvasStatus.Dirty
        )
      }
    })
  }

  const trackWebGLDraw = (context: WebGLRenderingContext | WebGL2RenderingContext) => {
    const canvas = context.canvas
    if (scope.nodeIds.get(canvas as HTMLCanvasElement) === undefined) {
      return
    }

    const htmlCanvas = canvas as HTMLCanvasElement
    const trackingState = getTrackingState(
      htmlCanvas,
      () => context.getContextAttributes()?.preserveDrawingBuffer === true
    )

    if (trackingState.preservesDrawingBuffer) {
      markCanvasDirty(canvas)
      return
    }
    scheduleSnapshot(htmlCanvas, trackingState)
  }

  const trackWebGPUSubmit = () => {
    // WebGPU has no preserveDrawingBuffer: the canvas texture is discarded once presented
    drawnWebGPUCanvases.forEach((canvas) =>
      scheduleSnapshot(
        canvas,
        getTrackingState(canvas, () => false)
      )
    )
    drawnWebGPUCanvases.clear()
  }

  if (typeof CanvasRenderingContext2D !== 'undefined') {
    CANVAS_2D_DRAWING_METHODS.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(CanvasRenderingContext2D.prototype, method, ({ target: context, onPostCall }) => {
          onPostCall(() => markCanvasDirty(context.canvas))
        })
      )
    })
  }

  const instrumentWebGLDrawingMethods = <CONTEXT extends WebGLRenderingContext | WebGL2RenderingContext>(
    prototype: CONTEXT,
    drawingMethods: ReadonlyArray<keyof CONTEXT>
  ) => {
    drawingMethods.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(prototype, method, ({ target: context, onPostCall }) => {
          onPostCall(() => trackWebGLDraw(context))
        })
      )
    })
  }

  if (typeof WebGLRenderingContext !== 'undefined') {
    instrumentWebGLDrawingMethods(WebGLRenderingContext.prototype, WEBGL_DRAWING_METHODS)
  }

  if (typeof WebGL2RenderingContext !== 'undefined') {
    instrumentWebGLDrawingMethods(WebGL2RenderingContext.prototype, WEBGL_DRAWING_METHODS)
    instrumentWebGLDrawingMethods(WebGL2RenderingContext.prototype, WEBGL_2_DRAWING_METHODS)
  }

  // WebGPU draws through the device queue, which is not tied to a canvas: the canvas is known when
  // its texture is requested, and drawn once the commands are submitted.
  if (typeof GPUCanvasContext !== 'undefined' && typeof GPUQueue !== 'undefined') {
    instrumentationStoppers.push(
      instrumentMethod(GPUCanvasContext.prototype, 'getCurrentTexture', ({ target: context, onPostCall }) => {
        onPostCall(() => {
          if (scope.nodeIds.get(context.canvas as HTMLCanvasElement) !== undefined) {
            drawnWebGPUCanvases.add(context.canvas as HTMLCanvasElement)
          }
        })
      }),
      instrumentMethod(GPUQueue.prototype, 'submit', ({ onPostCall }) => {
        onPostCall(trackWebGPUSubmit)
      })
    )
  }

  return {
    stop: () => {
      stopped = true
      instrumentationStoppers.forEach((stopper) => stopper.stop())
    },
  }
}
