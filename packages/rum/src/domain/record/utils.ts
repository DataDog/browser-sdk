import { assign, includes, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '@datadog/browser-rum-core'
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

export function getFrustrationFromAction(frustrations: FrustrationType[]): FrustrationType {
  return includes(frustrations, FrustrationType.RAGE_CLICK)
    ? FrustrationType.RAGE_CLICK
    : includes(frustrations, FrustrationType.ERROR_CLICK)
    ? FrustrationType.ERROR_CLICK
    : FrustrationType.DEAD_CLICK
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
