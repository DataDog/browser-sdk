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
  // Action to send to hash a canvas snapshot and, if it changed since the last capture, encode it.
  // The worker will respond with a CanvasCaptureResponse with the same id.
  | CanvasCaptureAction

export interface CanvasCaptureAction {
  action: 'captureCanvas'
  id: number
  // Downscaled snapshot of the canvas, transferred to the worker
  bitmap: ImageBitmap
  // Dimensions of the canvas itself, which can differ from the bitmap ones
  canvasWidth: number
  canvasHeight: number
  // Hash returned by the last successful capture of this canvas, if any
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
  // Response to 'captureCanvas' action
  | CanvasCaptureResponse
  // Could happen at any time when something goes wrong in the worker
  | {
      type: 'errored'
      streamId?: number
      error: Error | string
    }

export type CanvasCaptureResponse =
  // The canvas changed since the last capture
  | {
      type: 'canvasCaptured'
      id: number
      hash: string
      image: Blob
    }
  // The hash matches `lastChangeHash`, so the image was not encoded
  | {
      type: 'canvasUnchanged'
      id: number
    }
  // The snapshot could not be hashed or encoded
  | {
      type: 'canvasCaptureFailed'
      id: number
      errorName: string | undefined
    }

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
  // Transferring ownership avoids copying large payloads, like canvas bitmaps
  postMessage(message: DeflateWorkerAction, transfer: Transferable[]): void
}

export type DeflateEncoder = Encoder<Uint8ArrayBuffer> & { stop: () => void }

export const enum DeflateEncoderStreamId {
  REPLAY = 1,
  RUM = 2,
  TELEMETRY = 4,
  PROFILING = 6,
}
