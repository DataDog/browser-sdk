import { setInterval, clearInterval } from './timer'
import type { TimeoutId } from './timer'
import { removeItem } from './utils/arrayUtils'
import type { Duration, RelativeTime } from './utils/timeUtils'
import { addDuration, relativeNow, ONE_MINUTE } from './utils/timeUtils'

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

  constructor(
    private expireDelay: number,
    private maxEntries?: number
  ) {
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
        removeItem(this.entries, entry)
      },
      close: (endTime: RelativeTime) => {
        entry.endTime = endTime
      },
    }

    if (this.maxEntries && this.entries.length >= this.maxEntries) {
      this.entries.pop()
    }

    this.entries.unshift(entry)

    return entry
  }

  /**
   * Return the latest value that was active during `startTime`, or the currently active value
   * if no `startTime` is provided. This method assumes that entries are not overlapping.
   *
   * If `option.returnInactive` is true, returns the value at `startTime` (active or not).
   */
  find(
    startTime: RelativeTime = END_OF_TIMES,
    options: { returnInactive: boolean } = { returnInactive: false }
  ): Value | undefined {
    for (const entry of this.entries) {
      if (entry.startTime <= startTime) {
        if (options.returnInactive || startTime <= entry.endTime) {
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
   * Return all values with an active period overlapping with the duration,
   * or all values that were active during `startTime` if no duration is provided,
   * or all currently active values if no `startTime` is provided.
   */
  findAll(startTime: RelativeTime = END_OF_TIMES, duration = 0 as Duration): Value[] {
    const endTime = addDuration(startTime, duration)
    return this.entries
      .filter((entry) => entry.startTime <= endTime && startTime <= entry.endTime)
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
