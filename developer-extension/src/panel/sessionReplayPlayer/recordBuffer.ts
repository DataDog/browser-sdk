import type { BrowserRecord } from '@datadog/browser-rum/src/types'
import { isStartOfFullSnapshot } from './recordUtils'

export type RecordListener = (record: BrowserRecord) => void

export interface RecordBuffer {
  /**
   * Adds a new record to the buffer. Records which arrive before the first full snapshot
   * are dropped. Listeners are immediately notified of new records.
   */
  add(record: BrowserRecord): void
  /** Gets all records in the buffer. */
  getRecords(): BrowserRecord[]
  /** Gets the number of records the buffer contains. */
  getCount(): number
  /** Adds a new listener, which will immediately be notified of all records in the buffer. */
  addListener(listener: RecordListener): void
}

export function createRecordBuffer(): RecordBuffer {
  const records: BrowserRecord[] = []
  const listeners = new Set<RecordListener>()
  return {
    add(record: BrowserRecord) {
      if (isStartOfFullSnapshot(record)) {
        records.length = 0
      } else if (records.length === 0) {
        return // Drop all records until the first full snapshot.
      }
      records.push(record)

      for (const listener of listeners) {
        listener(record)
      }
    },
    getRecords(): BrowserRecord[] {
      return [...records]
    },
    getCount(): number {
      return records.length
    },
    addListener(listener: RecordListener) {
      if (listeners.has(listener)) {
        return
      }
      listeners.add(listener)

      for (const record of records) {
        listener(record)
      }
    },
  }
}
