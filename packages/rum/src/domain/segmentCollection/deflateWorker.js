import { workerString } from '@datadog/browser-worker/string'

let workerURL

export function createDeflateWorker() {
  // Lazily compute the worker URL to allow importing the SDK in NodeJS
  if (!workerURL) {
    workerURL = URL.createObjectURL(new Blob([workerString]))
  }
  return new Worker(workerURL)
}
