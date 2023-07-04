import type { DeflateWorkerAction, DeflateWorkerResponse } from '@datadog/browser-worker'

export function createDeflateWorker(): DeflateWorker

export interface DeflateWorker extends Worker {
  postMessage(message: DeflateWorkerAction): void
}

export type DeflateWorkerListener = (event: { data: DeflateWorkerResponse }) => void
