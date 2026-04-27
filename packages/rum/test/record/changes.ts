import type { BrowserChangeRecord, BrowserFullSnapshotChangeRecord, BrowserRecord } from '../../src/types'
import { RecordType, SnapshotFormat } from '../../src/types'
import { createChangeDecoder } from '../../src/domain/record'

export function decodeChangeRecords(
  records: Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord>
): Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord> {
  const changeDecoder = createChangeDecoder()
  return records.map((record) => changeDecoder.decode(record))
}

export function decodeFullSnapshotChangeRecord(
  record: BrowserFullSnapshotChangeRecord
): BrowserFullSnapshotChangeRecord {
  const changeDecoder = createChangeDecoder()
  return changeDecoder.decode(record) as BrowserFullSnapshotChangeRecord
}

export function findChangeRecords(
  records: BrowserRecord[]
): Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord> {
  return records.filter(
    (record) =>
      record.type === RecordType.Change ||
      (record.type === RecordType.FullSnapshot && record.format === SnapshotFormat.Change)
  )
}
