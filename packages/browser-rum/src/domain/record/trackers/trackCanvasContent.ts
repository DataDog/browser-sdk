import { instrumentMethod, noop } from '@datadog/browser-core'
import { getNodePrivacyLevel, NodePrivacyLevel } from '@datadog/browser-rum-core'
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

interface WebGLTrackingState {
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
  const webGLSnapshotInterval = ONE_SECOND / configuration.maxFramesPerSecond
  const webGLTrackingStates = new WeakMap<HTMLCanvasElement, WebGLTrackingState>()
  let stopped = false

  const markCanvasDirty = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
    if (scope.nodeIds.get(canvas as HTMLCanvasElement) !== undefined) {
      scope.canvasManager.markCanvas(canvas as HTMLCanvasElement, CanvasStatus.Dirty)
    }
  }

  const trackWebGLDraw = (context: WebGLRenderingContext | WebGL2RenderingContext) => {
    const canvas = context.canvas
    if (scope.nodeIds.get(canvas as HTMLCanvasElement) === undefined) {
      return
    }

    const htmlCanvas = canvas as HTMLCanvasElement

    let trackingState = webGLTrackingStates.get(htmlCanvas)
    if (!trackingState) {
      trackingState = {
        nextSnapshotTime: -Infinity,
        preservesDrawingBuffer: context.getContextAttributes()?.preserveDrawingBuffer === true,
        snapshotScheduled: false,
      }
      webGLTrackingStates.set(htmlCanvas, trackingState)
    }

    if (trackingState.preservesDrawingBuffer) {
      markCanvasDirty(canvas)
      return
    }
    const now = performance.now()
    if (trackingState.snapshotScheduled || now < trackingState.nextSnapshotTime) {
      return
    }

    trackingState.snapshotScheduled = true
    trackingState.nextSnapshotTime = now + webGLSnapshotInterval
    void Promise.resolve().then(() => {
      trackingState.snapshotScheduled = false
      if (
        stopped ||
        getNodePrivacyLevel(htmlCanvas, scope.configuration.defaultPrivacyLevel) !== NodePrivacyLevel.ALLOW
      ) {
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

  return {
    stop: () => {
      stopped = true
      instrumentationStoppers.forEach((stopper) => stopper.stop())
    },
  }
}
