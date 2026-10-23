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
  // Action to send with a MessagePort to spawn a canvas worker answering on that port. The worker
  // will respond with a 'canvasWorkerErrored' response if the canvas worker fails.
  | {
      action: 'startCanvasWorker'
    }
  // Action sent by the worker to the canvas worker it spawned, with the MessagePort.
  | {
      action: 'canvasInit'
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
  // Response to 'startCanvasWorker' action, when the canvas worker fails to spawn or crashes
  | {
      type: 'canvasWorkerErrored'
      error: string
    }

// Protocol between the main thread and the canvas worker, over the MessagePort sent with the
// 'startCanvasWorker' action.
export interface CanvasWorkerRequest {
  action: 'stop'
}

export interface CanvasWorkerResponse {
  type: 'ready'
}

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
  postMessage(message: DeflateWorkerAction, transfer: Transferable[]): void
}

export type DeflateEncoder = Encoder<Uint8ArrayBuffer> & { stop: () => void }

export const enum DeflateEncoderStreamId {
  REPLAY = 1,
  RUM = 2,
  TELEMETRY = 4,
  PROFILING = 6,
}
