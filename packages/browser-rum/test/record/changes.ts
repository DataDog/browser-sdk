import type {
  BrowserChangeRecord,
  BrowserFullSnapshotChangeRecord,
  BrowserRecord,
  InputSelectionChange,
  InputValueChange,
} from '../../src/types'
import { ChangeType, RecordType, SnapshotFormat } from '../../src/types'
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
  return changeDecoder.decode(record)
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

/**
 * The InputValue changes recorded for the given node id, in the order they were recorded. The
 * records must already be decoded, so that the recorded values are literal strings.
 */
export function findInputValues(
  records: Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord>,
  nodeId: number
): string[] {
  const values: string[] = []
  for (const change of findChangesOfType(records, ChangeType.InputValue)) {
    const [changedNodeId, value] = change as InputValueChange
    if (changedNodeId === nodeId) {
      values.push(value as string)
    }
  }
  return values
}

/**
 * The selection states recorded for the given node id by InputSelection changes, in the order
 * they were recorded.
 */
export function findInputSelections(
  records: Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord>,
  nodeId: number
): number[] {
  const states: number[] = []
  for (const change of findChangesOfType(records, ChangeType.InputSelection)) {
    const [state, ...nodeIds] = change as InputSelectionChange
    if (nodeIds.indexOf(nodeId) >= 0) {
      states.push(state)
    }
  }
  return states
}

function findChangesOfType(
  records: Array<BrowserChangeRecord | BrowserFullSnapshotChangeRecord>,
  type: ChangeType
): unknown[] {
  const changesOfType: unknown[] = []
  for (const record of records) {
    for (const change of record.data) {
      if (change[0] === type) {
        changesOfType.push(...change.slice(1))
      }
    }
  }
  return changesOfType
}
