import type { TimeStamp } from '@datadog/browser-core'
import { timeStampNow } from '@datadog/browser-core'
import type { BrowserIncrementalData, BrowserIncrementalSnapshotRecord } from 'rum-events-format/session-replay-browser'
import { RecordType } from 'rum-events-format/session-replay-browser'

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
