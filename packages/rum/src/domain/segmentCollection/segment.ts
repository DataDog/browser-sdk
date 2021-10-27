import { addMonitoringMessage, monitor } from '@datadog/browser-core'
import { CreationReason, Record, RecordType, SegmentContext, SegmentMeta } from '../../types'
import * as replayStats from '../replayStats'
import { DeflateWorker, DeflateWorkerListener } from './deflateWorker'

let nextId = 0

export class Segment {
  public isFlushed = false
  public flushReason?: string

  private id = nextId++
  private start: number
  private end: number
  private recordsCount: number
  private hasFullSnapshot: boolean

  constructor(
    private worker: DeflateWorker,
    readonly context: SegmentContext,
    private creationReason: CreationReason,
    initialRecord: Record,
    onWrote: (compressedSize: number) => void,
    onFlushed: (data: Uint8Array, rawSize: number) => void
  ) {
    this.start = initialRecord.timestamp
    this.end = initialRecord.timestamp
    this.recordsCount = 1
    this.hasFullSnapshot = initialRecord.type === RecordType.FullSnapshot

    const viewId = this.context.view.id
    replayStats.addSegment(viewId)
    replayStats.addRecord(viewId)

    const listener: DeflateWorkerListener = monitor(({ data }) => {
      if (data.type === 'errored' || data.type === 'initialized') {
        return
      }

      if (data.id === this.id) {
        replayStats.addWroteData(viewId, data.additionalRawSize)
        if (data.type === 'flushed') {
          onFlushed(data.result, data.rawSize)
          worker.removeEventListener('message', listener)
        } else {
          onWrote(data.compressedSize)
        }
      } else if (data.id > this.id) {
        // Messages should be received in the same order as they are sent, so if we receive a
        // message with an id superior to this Segment instance id, we know that another, more
        // recent Segment instance is being used.
        //
        // In theory, a "flush" response should have been received at this point, so the listener
        // should already have been removed. But if something goes wrong and we didn't receive a
        // "flush" response, remove the listener to avoid any leak, and send a monitor message to
        // help investigate the issue.
        worker.removeEventListener('message', listener)
        addMonitoringMessage(`Segment did not receive a 'flush' response before being replaced.`)
      }
    })
    worker.addEventListener('message', listener)
    this.worker.postMessage({ data: `{"records":[${JSON.stringify(initialRecord)}`, id: this.id, action: 'write' })
  }

  addRecord(record: Record): void {
    this.end = record.timestamp
    this.recordsCount += 1
    replayStats.addRecord(this.context.view.id)
    this.hasFullSnapshot ||= record.type === RecordType.FullSnapshot
    this.worker.postMessage({ data: `,${JSON.stringify(record)}`, id: this.id, action: 'write' })
  }

  flush(reason?: string) {
    this.worker.postMessage({
      data: `],${JSON.stringify(this.meta).slice(1)}\n`,
      id: this.id,
      action: 'flush',
    })
    this.isFlushed = true
    this.flushReason = reason
  }

  get meta(): SegmentMeta {
    return {
      creation_reason: this.creationReason,
      end: this.end,
      has_full_snapshot: this.hasFullSnapshot,
      records_count: this.recordsCount,
      start: this.start,
      ...this.context,
    }
  }
}
