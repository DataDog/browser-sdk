import { IncrementalSource, MouseMoveRecord, Record, RecordType } from '../types'

export function isMouseMoveRecord(record: Record): record is MouseMoveRecord {
  return (
    record.type === RecordType.IncrementalSnapshot &&
    (record.data.source === IncrementalSource.MouseMove || record.data.source === IncrementalSource.TouchMove)
  )
}

export function groupMouseMoves(records: MouseMoveRecord[]): MouseMoveRecord {
  const mostRecentTimestamp = records[records.length - 1]!.timestamp
  return {
    data: {
      // Because we disabled mouse move batching from RRWeb, there will be only one position in each
      // record, and its timeOffset will be 0.
      positions: records.map(({ timestamp, data: { positions: [position] } }) => ({
        ...position,
        timeOffset: timestamp - mostRecentTimestamp,
      })),
      source: records[0]!.data.source,
    },
    timestamp: mostRecentTimestamp,
    type: RecordType.IncrementalSnapshot,
  }
}

export function getRecordStartEnd(record: Record): [number, number] {
  if (isMouseMoveRecord(record)) {
    return [record.timestamp + record.data.positions[0]!.timeOffset, record.timestamp]
  }
  return [record.timestamp, record.timestamp]
}
