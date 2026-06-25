import { timeStampNow } from '@datadog/js-core/time'
import type { TimeStamp } from '@datadog/js-core/time'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'

export function assembleIncrementalSnapshot<Data extends BrowserIncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>,
  timestamp: TimeStamp = timeStampNow()
): BrowserIncrementalSnapshotRecord {
  return {
    data: {
      source,
      ...data,
    } as Data,
    type: RecordType.IncrementalSnapshot,
    timestamp,
  }
}
