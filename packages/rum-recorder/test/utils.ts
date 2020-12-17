import { IncrementalSource, MouseMoveRecord, MousePosition, RecordType } from '../src/types'

export function makeMouseMoveRecord(timestamp: number, positions: Array<Partial<MousePosition>>): MouseMoveRecord {
  return {
    timestamp,
    data: {
      positions: positions.map((position) => ({ id: 0, timeOffset: 0, x: 0, y: 1, ...position })),
      source: IncrementalSource.MouseMove,
    },
    type: RecordType.IncrementalSnapshot,
  }
}
