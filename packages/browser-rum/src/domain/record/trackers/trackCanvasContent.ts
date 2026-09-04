import { instrumentMethod, noop } from '@datadog/browser-core'
import type { RecordingScope } from '../recordingScope'
import { CanvasStatus } from '../canvas/canvasManager'
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

export function trackCanvasContent(scope: RecordingScope): Tracker {
  if (
    !scope.configuration.sessionReplayCanvasRecording?.enable ||
    scope.configuration.sessionReplayCanvasRecording.maxFramesPerSecond === 0 ||
    typeof CanvasRenderingContext2D === 'undefined'
  ) {
    return { stop: noop }
  }

  const instrumentationStoppers: Tracker[] = []

  CANVAS_2D_DRAWING_METHODS.forEach((method) => {
    instrumentationStoppers.push(
      instrumentMethod(CanvasRenderingContext2D.prototype, method, ({ target: context, onPostCall }) => {
        onPostCall(() => {
          if (scope.nodeIds.get(context.canvas) !== undefined) {
            scope.canvasManager.markCanvas(context.canvas, CanvasStatus.Dirty)
          }
        })
      })
    )
  })

  return {
    stop: () => instrumentationStoppers.forEach((stopper) => stopper.stop()),
  }
}
