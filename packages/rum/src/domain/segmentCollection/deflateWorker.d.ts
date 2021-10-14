export function createDeflateWorker(): DeflateWorker

export interface DeflateWorker {
  addEventListener(name: 'message', listener: DeflateWorkerListener): void
  removeEventListener(name: 'message', listener: DeflateWorkerListener): void
  postMessage(message: DeflateWorkerAction): void
  terminate(): void
}

export type DeflateWorkerListener = (event: { data: DeflateWorkerResponse }) => void

export type DeflateWorkerAction =
  | {
      id: number
      action: 'write'
      data: string
    }
  | {
      id: number
      action: 'flush'
      data?: string
    }

export type DeflateWorkerResponse =
  | {
      type: 'wrote'
      id: number
      compressedSize: number
      additionalRawSize: number
    }
  | {
      type: 'flushed'
      id: number
      result: Uint8Array
      additionalRawSize: number
      rawSize: number
    }
  | {
      type: 'error'
      error: Error | string
    }
