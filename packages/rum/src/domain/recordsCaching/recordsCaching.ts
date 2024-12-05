import type { BrowserRecord } from '../../types'

export function startRecordsCaching() {
  const records: BrowserRecord[] = []

  function addRecord(record: BrowserRecord) {
    records.push(record)
  }

  function getRecords() {
    return records
  }

  return {
    addRecord,
    getRecords,
  }
}
