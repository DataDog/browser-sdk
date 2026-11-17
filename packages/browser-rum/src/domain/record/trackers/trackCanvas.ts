import type { RecordingScope } from '../recordingScope'
import { startCanvasWorker } from '../canvas/canvasWorker'
import type { Tracker } from './tracker.types'
import { trackCanvasContent } from './trackCanvasContent'
import { trackCanvasCapture } from './trackCanvasCapture'

export function trackCanvas(scope: RecordingScope, notifyContentMutated: () => void): Tracker {
  const trackers: Tracker[] = []
  const stop = () => trackers.forEach((tracker) => tracker.stop())

  // The rest of the recording keeps running if the canvas worker fails to start.
  const worker = startCanvasWorker(scope.configuration, stop)
  if (worker) {
    trackers.push(trackCanvasContent(scope), trackCanvasCapture(scope, worker, notifyContentMutated))
  }

  return { stop }
}
