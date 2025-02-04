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
      result: Uint8Array
      trailer: Uint8Array
      additionalBytesCount: number
    }
  // Could happen at any time when something goes wrong in the worker
  | {
      type: 'errored'
      streamId?: number
      error: Error | string
    }

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
}

export type DeflateEncoder = Encoder<Uint8Array> & { stop: () => void }

export const enum DeflateEncoderStreamId {
  REPLAY = 1,
  RUM = 2,
  RUM_REPLICA = 3,
}
