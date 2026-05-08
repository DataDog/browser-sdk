import type { Pipeline } from '@datadog/core-next'

const SEGMENT_DURATION_LIMIT = 5_000
const SEGMENT_BYTES_LIMIT = 60_000
const FULL_SNAPSHOT_RECORD_TYPE = 2

interface SegmentCollectionOptions {
  pipeline: Pipeline<Record<string, unknown>>
}

interface SegmentState {
  records: Record<string, unknown>[]
  byteCount: number
  startTime: number
  hasFullSnapshot: boolean
}

type CollectionState = { status: 'waiting' } | { status: 'pending'; segment: SegmentState }

function startSegmentCollection(options: SegmentCollectionOptions): {
  addRecord: (record: Record<string, unknown>) => void
  flush: (reason: string) => void
  stop: () => void
} {
  const { pipeline } = options

  let state: CollectionState = { status: 'waiting' }
  let indexInView = 0
  let durationTimer: ReturnType<typeof setTimeout> | undefined

  function addRecord(record: Record<string, unknown>): void {
    if (state.status === 'waiting') {
      state = {
        status: 'pending',
        segment: {
          records: [],
          byteCount: 0,
          startTime: (record['timestamp'] as number) ?? Date.now(),
          hasFullSnapshot: false,
        },
      }
      durationTimer = setTimeout(() => flush('segment_duration_limit'), SEGMENT_DURATION_LIMIT)
    }

    const segment = (state as { status: 'pending'; segment: SegmentState }).segment
    segment.records.push(record)
    segment.byteCount += JSON.stringify(record).length

    if (record['type'] === FULL_SNAPSHOT_RECORD_TYPE) {
      segment.hasFullSnapshot = true
    }

    if (segment.byteCount >= SEGMENT_BYTES_LIMIT) {
      flush('segment_bytes_limit')
    }
  }

  function flush(reason: string): void {
    if (state.status !== 'pending') {
      return
    }

    clearTimeout(durationTimer)
    durationTimer = undefined

    const { segment } = state
    const records = segment.records
    const lastRecord = records[records.length - 1]

    pipeline.publish('observation:replay' as keyof Record<string, unknown>, {
      type: 'replay',
      segment: {
        records,
        creation_reason: reason,
        records_count: records.length,
        has_full_snapshot: segment.hasFullSnapshot,
        index_in_view: indexInView,
        start: segment.startTime,
        end: (lastRecord?.['timestamp'] as number) ?? segment.startTime,
      },
    } as Record<string, unknown>)

    if (reason === 'view_change') {
      indexInView = 0
    } else {
      indexInView += 1
    }

    state = { status: 'waiting' }
  }

  function stop(): void {
    clearTimeout(durationTimer)
    durationTimer = undefined
  }

  return { addRecord, flush, stop }
}

export type { SegmentCollectionOptions }
export { startSegmentCollection }
