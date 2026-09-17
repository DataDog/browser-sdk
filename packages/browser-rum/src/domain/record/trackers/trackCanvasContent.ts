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
const ANGLE_INSTANCED_DRAWING_METHODS = ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE'] as const
const WEBGL_MULTI_DRAWING_METHODS = [
  'multiDrawArraysWEBGL',
  'multiDrawElementsWEBGL',
  'multiDrawArraysInstancedWEBGL',
  'multiDrawElementsInstancedWEBGL',
] as const

// eslint-disable-next-line camelcase -- Browser API name
type AngleInstancedArrays = ANGLE_instanced_arrays
// eslint-disable-next-line camelcase -- Browser API name
type WebGLMultiDraw = WEBGL_multi_draw

export function trackCanvasContent(scope: RecordingScope): Tracker {
  const configuration = scope.configuration.sessionReplayCanvasRecording
  if (!configuration?.enable || configuration.maxFramesPerSecond === 0) {
    return { stop: noop }
  }

  const instrumentationStoppers: Tracker[] = []
  const webGLSnapshotInterval = ONE_SECOND / configuration.maxFramesPerSecond
  const lastWebGLSnapshotTimes = new WeakMap<HTMLCanvasElement, number>()
  const scheduledWebGLSnapshots = new WeakSet<HTMLCanvasElement>()
  const instrumentedWebGLExtensions = new WeakSet<object>()
  let stopped = false

  const markCanvasDirty = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
    if (canvas instanceof HTMLCanvasElement && scope.nodeIds.get(canvas) !== undefined) {
      scope.canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
    }
  }

  const scheduleWebGLSnapshot = (canvas: HTMLCanvasElement | OffscreenCanvas) => {
    if (
      !(canvas instanceof HTMLCanvasElement) ||
      scope.nodeIds.get(canvas) === undefined ||
      scheduledWebGLSnapshots.has(canvas) ||
      performance.now() - (lastWebGLSnapshotTimes.get(canvas) ?? -Infinity) < webGLSnapshotInterval
    ) {
      return
    }

    scheduledWebGLSnapshots.add(canvas)
    void Promise.resolve().then(() => {
      scheduledWebGLSnapshots.delete(canvas)
      if (stopped || getNodePrivacyLevel(canvas, scope.configuration.defaultPrivacyLevel) !== NodePrivacyLevel.ALLOW) {
        return
      }

      try {
        const snapshot = createCanvasSnapshot(canvas, configuration.maxImageDimension)
        if (snapshot) {
          lastWebGLSnapshotTimes.set(canvas, performance.now())
          scope.canvasManager.setCanvasSnapshot(canvas, snapshot)
          scope.canvasManager.markCanvas(canvas, CanvasStatus.Dirty)
        }
      } catch (error) {
        scope.canvasManager.markCanvas(
          canvas,
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

  const instrumentWebGLContext = (prototype: WebGLRenderingContext | WebGL2RenderingContext) => {
    WEBGL_DRAWING_METHODS.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(prototype, method, ({ target: context, onPostCall }) => {
          onPostCall(() => scheduleWebGLSnapshot(context.canvas))
        })
      )
    })

    instrumentationStoppers.push(
      instrumentMethod(prototype, 'getExtension', ({ target: context, onPostCall }) => {
        onPostCall((extension) => {
          if (!extension || typeof extension !== 'object' || instrumentedWebGLExtensions.has(extension)) {
            return
          }

          if (isANGLEInstancedArrays(extension)) {
            instrumentWebGLExtension(context, extension, ANGLE_INSTANCED_DRAWING_METHODS)
          } else if (isWEBGLMultiDraw(extension)) {
            instrumentWebGLExtension(context, extension, WEBGL_MULTI_DRAWING_METHODS)
          } else {
            return
          }
          instrumentedWebGLExtensions.add(extension)
        })
      })
    )
  }

  const instrumentWebGLExtension = <
    EXTENSION extends AngleInstancedArrays | WebGLMultiDraw,
    METHOD extends keyof EXTENSION,
  >(
    context: WebGLRenderingContext | WebGL2RenderingContext,
    extension: EXTENSION,
    methods: readonly METHOD[]
  ) => {
    methods.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(extension, method, ({ onPostCall }) => {
          onPostCall(() => scheduleWebGLSnapshot(context.canvas))
        })
      )
    })
  }

  if (typeof WebGLRenderingContext !== 'undefined') {
    instrumentWebGLContext(WebGLRenderingContext.prototype)
  }

  if (typeof WebGL2RenderingContext !== 'undefined') {
    instrumentWebGLContext(WebGL2RenderingContext.prototype)
    WEBGL_2_DRAWING_METHODS.forEach((method) => {
      instrumentationStoppers.push(
        instrumentMethod(WebGL2RenderingContext.prototype, method, ({ target: context, onPostCall }) => {
          onPostCall(() => scheduleWebGLSnapshot(context.canvas))
        })
      )
    })
  }

  return {
    stop: () => {
      stopped = true
      instrumentationStoppers.forEach((stopper) => stopper.stop())
    },
  }
}

function isANGLEInstancedArrays(extension: object): extension is AngleInstancedArrays {
  return 'drawArraysInstancedANGLE' in extension
}

function isWEBGLMultiDraw(extension: object): extension is WebGLMultiDraw {
  return 'multiDrawArraysWEBGL' in extension
}
