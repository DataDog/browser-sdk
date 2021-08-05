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
      id: number
      compressedSize: number
      rawSize: number
    }
  | {
      id: number
      result: Uint8Array
      rawSize: number
    }
  | { error: Error | string }
