import { addTelemetryDebug, assign, sendToExtension, addEventListener, concatBuffers } from '@datadog/browser-core'
import type { DeflateWorkerResponse } from '@datadog/browser-worker'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import type { BrowserRecord, BrowserSegmentMetadata, CreationReason, SegmentContext } from '../../types'
import { RecordType } from '../../types'
import * as replayStats from '../replayStats'
import type { DeflateWorker } from './startDeflateWorker'

// Arbitrary id, will be replaced when we have multiple parallel streams.
const STREAM_ID = 1
let nextId = 0

export type FlushReason = Exclude<CreationReason, 'init'> | 'stop'

export class Segment {
  public flushReason: FlushReason | undefined

  public readonly metadata: BrowserSegmentMetadata

  private id = nextId++
  private pendingWriteCount = 0

  constructor(
    configuration: RumConfiguration,
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
    let rawBytesCount = 0
    let compressedBytesCount = 0
    const compressedData: Uint8Array[] = []

    const { stop: removeMessageListener } = addEventListener(
      configuration,
      worker,
      'message',
      ({ data }: MessageEvent<DeflateWorkerResponse>) => {
        if (data.type !== 'wrote') {
          return
        }

        if (data.id === this.id) {
          this.pendingWriteCount -= 1
          replayStats.addWroteData(viewId, data.additionalBytesCount)
          rawBytesCount += data.additionalBytesCount
          compressedBytesCount += data.result.length
          compressedData.push(data.result)
          if (this.flushReason && this.pendingWriteCount === 0) {
            compressedData.push(data.trailer)
            onFlushed(concatBuffers(compressedData), rawBytesCount)
            removeMessageListener()
          } else {
            onWrote(compressedBytesCount)
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
    this.write(`{"records":[${JSON.stringify(initialRecord)}`)
  }

  addRecord(record: BrowserRecord): void {
    this.metadata.start = Math.min(this.metadata.start, record.timestamp)
    this.metadata.end = Math.max(this.metadata.end, record.timestamp)
    this.metadata.records_count += 1
    replayStats.addRecord(this.metadata.view.id)
    this.metadata.has_full_snapshot ||= record.type === RecordType.FullSnapshot
    sendToExtension('record', { record, segment: this.metadata })
    this.write(`,${JSON.stringify(record)}`)
  }

  flush(reason: FlushReason) {
    this.write(`],${JSON.stringify(this.metadata).slice(1)}\n`)
    this.worker.postMessage({
      action: 'reset',
      streamId: STREAM_ID,
    })
    this.flushReason = reason
  }

  private write(data: string) {
    this.pendingWriteCount += 1
    this.worker.postMessage({
      data,
      id: this.id,
      streamId: STREAM_ID,
      action: 'write',
    })
  }
}
