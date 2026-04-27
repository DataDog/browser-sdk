import type { TimeStamp } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/browser-core'
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
