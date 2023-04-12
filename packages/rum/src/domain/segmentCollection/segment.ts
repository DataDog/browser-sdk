import { addTelemetryDebug, assign, sendToExtension, addEventListener } from '@datadog/browser-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'
import type { DeflateWorker, DeflateWorkerResponse } from './deflateWorker'

let nextId = 0

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'

export class Segment {
  public flushReason: FlushReason | undefined

  public readonly metadata: BrowserSegmentMetadata

  private id = nextId++

  constructor(
    private worker: DeflateWorker,
    context: SegmentContext,
    creationReason: CreationReason,
    initialRecord: BrowserRecord,
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
        source: 'browser' as const,
      },
      context
    )

    replayStats.addSegment(viewId)
    replayStats.addRecord(viewId)

    const { stop: removeMessageListener } = addEventListener(
      worker,
      'message',
      ({ data }: MessageEvent<DeflateWorkerResponse>) => {
        if (data.type === 'errored' || data.type === 'initialized') {
          return
        }

        if (data.id === this.id) {
          replayStats.addWroteData(viewId, data.additionalBytesCount)
          if (data.type === 'flushed') {
            onFlushed(data.result, data.rawBytesCount)
            removeMessageListener()
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
          removeMessageListener()
          addTelemetryDebug("Segment did not receive a 'flush' response before being replaced.")
        }
      }
    )
    sendToExtension('record', { record: initialRecord, segment: this.metadata })
    this.worker.postMessage({ data: `{"records":[${JSON.stringify(initialRecord)}`, id: this.id, action: 'write' })
  }

  addRecord(record: BrowserRecord): void {
    this.metadata.start = Math.min(this.metadata.start, record.timestamp)
    this.metadata.end = Math.max(this.metadata.end, record.timestamp)
    this.metadata.records_count += 1
    replayStats.addRecord(this.metadata.view.id)
    this.metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot
    sendToExtension('record', { record, segment: this.metadata })
    this.worker.postMessage({ data: `,${JSON.stringify(record)}`, id: this.id, action: 'write' })
  }

  flush(reason: FlushReason) {
    this.worker.postMessage({
      data: `],${JSON.stringify(this.metadata).slice(1)}\n`,
      id: this.id,
      action: 'flush',
    })
    this.flushReason = reason
  }
}
