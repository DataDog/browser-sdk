import { assign, timeStampNow } from '@datadog/browser-core'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'

export function assembleIncrementalSnapshot<Data extends BrowserIncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>
): BrowserIncrementalSnapshotRecord {
  return {
    timestamp: timeStampNow(),
    type: RecordType.IncrementalSnapshot,
    data: assign(
      {
        source,
      },
      data
    ) as Data,
  }
}
