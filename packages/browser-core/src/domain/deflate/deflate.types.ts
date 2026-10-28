import type { Uint8ArrayBuffer } from '@datadog/js-core/util'
import type { Encoder } from '../../tools/encoder'

export type DeflateWorkerAction =
  // Action to send when creating the worker to check if the communication is working correctly.
  // The worker should respond with a 'initialized' response.
  | {
      action: 'init'
    }
  // Action to send when writing some unfinished data. The worker will respond with a 'wrote'
  // response, with the same id and measurements of the wrote data bytes count.
  | {
      action: 'write'
      id: number
      streamId: number
      data: string
    }
  // Action to send when all data has been written and the state of the stream needs to be reset.
  | {
      action: 'reset'
      streamId: number
    }
  // Action sent to the 'canvas' worker to capture a canvas. The worker hashes a thumbnail of the
  // bitmap and responds with 'canvasUnchanged' if the hash matches `lastChangeHash`, or encodes the
  // bitmap and responds with 'canvasCaptured'. It responds with 'canvasCaptureFailed' otherwise.
  | CanvasCaptureAction

export interface CanvasCaptureAction {
  action: 'captureCanvas'
  id: number
  /** Already downscaled to the recorded image dimensions. Transferred, and closed once captured. */
  bitmap: ImageBitmap
  canvasWidth: number
  canvasHeight: number
  lastChangeHash: string | undefined
  hashingMaxDimension: number
  encodeQuality: number
}

export type DeflateWorkerResponse =
  // Response to 'init' action
  | {
      type: 'initialized'
      version: string
    }
  // Response to 'write' action
  | {
      type: 'wrote'
      id: number
      streamId: number
      result: Uint8ArrayBuffer
      trailer: Uint8ArrayBuffer
      additionalBytesCount: number
    }
  // Could happen at any time when something goes wrong in the worker
  | {
      type: 'errored'
      streamId?: number
      error: Error | string
    }
  // Responses to 'captureCanvas' action
  | CanvasCaptureResponse

export type CanvasCaptureResponse =
  | { type: 'canvasCaptured'; id: number; hash: string; image: Blob }
  | { type: 'canvasUnchanged'; id: number }
  | { type: 'canvasCaptureFailed'; id: number; errorName: string | undefined }

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
}

export type DeflateEncoder = Encoder<Uint8ArrayBuffer> & { stop: () => void }

export const enum DeflateEncoderStreamId {
  REPLAY = 1,
  RUM = 2,
  TELEMETRY = 4,
  PROFILING = 6,
}
