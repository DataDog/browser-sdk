import { SegmentMeta } from '../types'
import { DeflateWorker } from './deflateWorker'
import { SegmentWriter } from './segmentCollection'

export class DeflateSegmentWriter implements SegmentWriter {
  private nextId = 0
  private pendingMeta: Array<{ id: number; meta: SegmentMeta }> = []

  constructor(
    private worker: DeflateWorker,
    private onWrote: (size: number) => void,
    private onCompleted: (data: Uint8Array, meta: SegmentMeta) => void
  ) {
    worker.addEventListener('message', ({ data }) => {
      if ('result' in data) {
        let pendingMeta
        do {
          pendingMeta = this.pendingMeta.shift()!
        } while (pendingMeta.id < data.id)
        this.onCompleted(data.result, pendingMeta.meta)
      } else {
        this.onWrote(data.size)
      }
    })
  }

  write(data: string): void {
    this.worker.postMessage({ data, id: this.nextId, action: 'write' })
    this.nextId += 1
  }

  complete(data: string | undefined, meta: SegmentMeta): void {
    this.worker.postMessage({ data, id: this.nextId, action: 'complete' })
    this.pendingMeta.push({ meta, id: this.nextId })
    this.nextId += 1
  }
}
