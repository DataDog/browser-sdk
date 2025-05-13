import { timeStampNow } from '@flashcatcloud/browser-core'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from '../../types'
import { RecordType } from '../../types'

export function assembleIncrementalSnapshot<Data extends BrowserIncrementalData>(
  source: Data['source'],
  data: Omit<Data, 'source'>
): BrowserIncrementalSnapshotRecord {
  return {
    data: {
      source,
      ...data,
    } as Data,
    type: RecordType.IncrementalSnapshot,
    timestamp: timeStampNow(),
  }
}
