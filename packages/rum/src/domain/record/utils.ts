import { assign, timeStampNow } from '@datadog/browser-core'
import type { IncrementalData, IncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'

export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}

export function forEach<List extends { [index: number]: any }>(
  list: List,
  callback: (value: List[number], index: number, parent: List) => void
) {
  Array.prototype.forEach.call(list, callback as any)
}

export function assembleIncrementalSnapshot<Data extends IncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>
): IncrementalSnapshotRecord {
  return {
    data: assign(
      {
        source,
      },
      data
    ) as Data,
    type: RecordType.IncrementalSnapshot,
    timestamp: timeStampNow(),
  }
}
