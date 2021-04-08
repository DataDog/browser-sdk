import { addMonitoringMessage, monitor } from '@datadog/browser-core'
import { DeflateWorker, DeflateWorkerListener } from './deflateWorker'
import { SegmentWriter } from './segment'

let nextId = 0

export class DeflateSegmentWriter implements SegmentWriter {
  private id = nextId++

  constructor(private worker: DeflateWorker, onWrote: (size: number) => void, onFlushed: (data: Uint8Array) => void) {
    const listener: DeflateWorkerListener = monitor(({ data }) => {
      if ('error' in data) {
        return
      }

      if (data.id === this.id) {
        if ('result' in data) {
          onFlushed(data.result)
          worker.removeEventListener('message', listener)
        } else {
          onWrote(data.size)
        }
      } else if (data.id > this.id) {
        // Messages should be received in the same order as they are sent, so if we receive a
        // message with an id superior to this DeflateSegmentWriter instance id, we know that
        // another, more recent DeflateSegmentWriter instance is being used.
        //
        // In theory, a "flush" response should have been received at this point, so the listener
        // should already have been removed. But if something goes wrong and we didn't receive a
        // "flush" response, remove the listener to avoid any leak, and send a monitor message to
        // help investigate the issue.
        worker.removeEventListener('message', listener)
        addMonitoringMessage(`DeflateSegmentWriter did not receive a 'flush' response before being replaced.`)
      }
    })
    worker.addEventListener('message', listener)
  }

  write(data: string): void {
    this.worker.postMessage({ data, id: this.id, action: 'write' })
  }

  flush(data: string | undefined): void {
    this.worker.postMessage({ data, id: this.id, action: 'flush' })
  }
}
