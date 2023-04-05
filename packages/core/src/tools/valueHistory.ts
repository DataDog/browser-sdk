import { setInterval, clearInterval } from './timer'
import type { TimeoutId } from './timer'
import type { RelativeTime } from './utils/timeUtils'
import { relativeNow, ONE_MINUTE } from './utils/timeUtils'

const END_OF_TIMES = Infinity as RelativeTime

export interface ValueHistoryEntry<T> {
  startTime: RelativeTime
  endTime: RelativeTime
  value: T
  remove(): void
  close(endTime: RelativeTime): void
}

export const CLEAR_OLD_VALUES_INTERVAL = ONE_MINUTE

/**
 * Store and keep track of values spans. This whole class assumes that values are added in
 * chronological order (i.e. all entries have an increasing start time).
 */
export class ValueHistory<Value> {
  private entries: Array<ValueHistoryEntry<Value>> = []
  private clearOldValuesInterval: TimeoutId

  constructor(private expireDelay: number) {
    this.clearOldValuesInterval = setInterval(() => this.clearOldValues(), CLEAR_OLD_VALUES_INTERVAL)
  }

  /**
   * Add a value to the history associated with a start time. Returns a reference to this newly
   * added entry that can be removed or closed.
   */
  add(value: Value, startTime: RelativeTime): ValueHistoryEntry<Value> {
    const entry: ValueHistoryEntry<Value> = {
      value,
      startTime,
      endTime: END_OF_TIMES,
      remove: () => {
        const index = this.entries.indexOf(entry)
        if (index >= 0) {
          this.entries.splice(index, 1)
        }
      },
      close: (endTime: RelativeTime) => {
        entry.endTime = endTime
      },
    }
    this.entries.unshift(entry)
    return entry
  }

  /**
   * Return the latest value that was active during `startTime`, or the currently active value
   * if no `startTime` is provided. This method assumes that entries are not overlapping.
   */
  find(startTime: RelativeTime = END_OF_TIMES): Value | undefined {
    for (const entry of this.entries) {
      if (entry.startTime <= startTime) {
        if (startTime <= entry.endTime) {
          return entry.value
        }
        break
      }
    }
  }

  /**
   * Helper function to close the currently active value, if any. This method assumes that entries
   * are not overlapping.
   */
  closeActive(endTime: RelativeTime) {
    const latestEntry = this.entries[0]
    if (latestEntry && latestEntry.endTime === END_OF_TIMES) {
      latestEntry.close(endTime)
    }
  }

  /**
   * Return all values that were active during `startTime`, or all currently active values if no
   * `startTime` is provided.
   */
  findAll(startTime: RelativeTime = END_OF_TIMES): Value[] {
    return this.entries
      .filter((entry) => entry.startTime <= startTime && startTime <= entry.endTime)
      .map((entry) => entry.value)
  }

  /**
   * Remove all entries from this collection.
   */
  reset() {
    this.entries = []
  }

  /**
   * Stop internal garbage collection of past entries.
   */
  stop() {
    clearInterval(this.clearOldValuesInterval)
  }

  private clearOldValues() {
    const oldTimeThreshold = relativeNow() - this.expireDelay
    while (this.entries.length > 0 && this.entries[this.entries.length - 1].endTime < oldTimeThreshold) {
      this.entries.pop()
    }
  }
}
