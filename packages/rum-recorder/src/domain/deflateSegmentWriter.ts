import { addMonitoringMessage, addErrorToMonitoringBatch, monitor } from '@datadog/browser-core'
import { SegmentMeta } from '../types'
import { DeflateWorker } from './deflateWorker'
import { SegmentWriter } from './segment'

export class DeflateSegmentWriter implements SegmentWriter {
  private nextId = 0
  private pendingMeta: Array<{ id: number; meta: SegmentMeta }> = []

  constructor(
    private worker: DeflateWorker,
    private onWrote: (size: number) => void,
    private onFlushed: (data: Uint8Array, meta: SegmentMeta) => void
  ) {
    worker.addEventListener(
      'message',
      monitor(({ data }) => {
        if ('error' in data) {
          addErrorToMonitoringBatch(data.error)
        } else if ('result' in data) {
          let pendingMeta = this.pendingMeta.shift()!

          // Messages should be received in the same order as they are sent, so the first
          // 'pendingMeta' of the list should be the one corresponding to the handled message.
          // But if something goes wrong in the worker and a response is lost, we need to avoid
          // associating an incorrect meta to the flushed segment. Remove any pending meta with an id
          // inferior to the one being waited for.
          if (pendingMeta.id !== data.id) {
            let lostCount = 0
            while (pendingMeta.id !== data.id) {
              pendingMeta = this.pendingMeta.shift()!
              lostCount += 1
            }
            addMonitoringMessage(`${lostCount} deflate worker responses have been lost`)
          }
          this.onFlushed(data.result, pendingMeta.meta)
        } else {
          this.onWrote(data.size)
        }
      })
    )
  }

  write(data: string): void {
    this.worker.postMessage({ data, id: this.nextId, action: 'write' })
    this.nextId += 1
  }

  flush(data: string | undefined, meta: SegmentMeta): void {
    this.worker.postMessage({ data, id: this.nextId, action: 'flush' })
    this.pendingMeta.push({ meta, id: this.nextId })
    this.nextId += 1
  }
}
