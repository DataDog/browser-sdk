import { instrumentMethod, noop } from '@datadog/browser-core'
import type { RecordingScope } from '../recordingScope'
import type { Tracker } from './tracker.types'

export type MarkCanvasDirty = (canvas: HTMLCanvasElement) => void

type Canvas2DDrawingMethod =
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'fill'
  | 'stroke'
  | 'fillText'
  | 'strokeText'
  | 'drawImage'
  | 'putImageData'
  | 'drawFocusIfNeeded'
  | 'reset'

const CANVAS_2D_DRAWING_METHODS: readonly Canvas2DDrawingMethod[] = [
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
]

export function trackCanvasContent(scope: RecordingScope): Tracker {
  if (
    !scope.configuration.sessionReplayCanvasRecording?.enable ||
    scope.configuration.sessionReplayCanvasRecording.maxFramesPerSecond === 0 ||
    typeof CanvasRenderingContext2D === 'undefined'
  ) {
    return { stop: noop }
  }

  const instrumentationStoppers: Tracker[] = []

  const { markCanvasDirty } = scope.canvasManager

  CANVAS_2D_DRAWING_METHODS.forEach((method) => {
    instrumentationStoppers.push(
      instrumentMethod(CanvasRenderingContext2D.prototype, method, ({ target: context, onPostCall }) => {
        onPostCall(() => markCanvasDirty(context.canvas))
      })
    )
  })

  return {
    stop: () => instrumentationStoppers.forEach((stopper) => stopper.stop()),
  }
}
