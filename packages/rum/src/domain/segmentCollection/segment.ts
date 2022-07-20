import { addTelemetryDebug, assign, monitor } from '@datadog/browser-core'
import type { CreationReason, Record, SegmentContext, SegmentMetadata } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'
import type { DeflateWorker, DeflateWorkerListener } from './deflateWorker'

let nextId = 0

export class Segment {
  public isFlushed = false

  public readonly metadata: SegmentMetadata

  private id = nextId++

  constructor(
    private worker: DeflateWorker,
    context: SegmentContext,
    creationReason: CreationReason,
    initialRecord: Record,
    onWrote: (compressedBytesCount: number) => void,
    onFlushed: (data: Uint8Array, rawBytesCount: number) => void
  ) {
    const viewId = context.view.id

    this.metadata = assign(
      {
        start: initialRecord.timestamp,
        end: initialRecord.timestamp,
        creation_reason: creationReason,
        records_count: 1,
        has_full_snapshot: initialRecord.type === RecordType.FullSnapshot,
        index_in_view: replayStats.getSegmentsCount(viewId),
      },
      context
    )

    replayStats.addSegment(viewId)
    replayStats.addRecord(viewId)

    const listener: DeflateWorkerListener = monitor(({ data }) => {
      if (data.type === 'errored' || data.type === 'initialized') {
        return
      }

      if (data.id === this.id) {
        replayStats.addWroteData(viewId, data.additionalBytesCount)
        if (data.type === 'flushed') {
          onFlushed(data.result, data.rawBytesCount)
          worker.removeEventListener('message', listener)
        } else {
          onWrote(data.compressedBytesCount)
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
        addTelemetryDebug("Segment did not receive a 'flush' response before being replaced.")
      }
    })
    worker.addEventListener('message', listener)
    this.worker.postMessage({ data: `{"records":[${JSON.stringify(initialRecord)}`, id: this.id, action: 'write' })
  }

  addRecord(record: Record): void {
    this.metadata.start = Math.min(this.metadata.start, record.timestamp)
    this.metadata.end = Math.max(this.metadata.end, record.timestamp)
    this.metadata.records_count += 1
    replayStats.addRecord(this.metadata.view.id)
    this.metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot
    this.worker.postMessage({ data: `,${JSON.stringify(record)}`, id: this.id, action: 'write' })
  }

  flush() {
    this.worker.postMessage({
      data: `],${JSON.stringify(this.metadata).slice(1)}\n`,
      id: this.id,
      action: 'flush',
    })
    this.isFlushed = true
  }
}
