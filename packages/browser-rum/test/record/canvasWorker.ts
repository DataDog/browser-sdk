import { replaceMockable } from '@datadog/browser-core/test'
import { captureCanvas } from '../../../browser-worker/src/domain/canvasCapture'
import type { CanvasWorkerFailureReason } from '../../src/domain/record'
import { startCanvasWorker } from '../../src/domain/record'

/**
 * Replaces the canvas worker with one running the canvas worker logic in-process.
 */
export function mockCanvasWorker() {
  const canvasWorkerMock: {
    ready: boolean
    stopSpy: jasmine.Spy
    fail: (reason: CanvasWorkerFailureReason) => void
  } = {
    ready: true,
    stopSpy: jasmine.createSpy('stopCanvasWorker'),
    fail: () => {
      throw new Error('the canvas worker is not started')
    },
  }

  replaceMockable(startCanvasWorker, (configuration, onFailure) => {
    canvasWorkerMock.fail = onFailure
    let nextCaptureId = 0
    return {
      isReady: () => canvasWorkerMock.ready,
      capture: async (snapshot, lastChangeHash) =>
        captureCanvas({
          action: 'captureCanvas',
          id: nextCaptureId++,
          bitmap: await snapshot.bitmap,
          canvasWidth: snapshot.canvasWidth,
          canvasHeight: snapshot.canvasHeight,
          lastChangeHash,
          hashingMaxDimension: configuration.sessionReplayCanvasRecording!.hashingMaxDimension,
          encodeQuality: configuration.sessionReplayCanvasRecording!.encodeQuality,
        }),
      stop: canvasWorkerMock.stopSpy,
    }
  })

  return canvasWorkerMock
}
