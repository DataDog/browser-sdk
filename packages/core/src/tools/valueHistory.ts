import type { Context } from './serialisation/context'
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
 * Store and keep track of values spans. This whole cache assumes that values are added in
 * chronological order (i.e. all entries have an increasing start time).
 */
export interface ValueHistory<Value> {
  add: (value: Value, startTime: RelativeTime) => ValueHistoryEntry<Value>
  find: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => Value | undefined

  closeActive: (endTime: RelativeTime) => void
  findAll: (startTime?: RelativeTime, duration?: Duration) => Value[]
  reset: () => void
  stop: () => void

  getAllEntries: () => Context[]
  getDeletedEntries: () => RelativeTime[]
}

let cleanupHistoriesInterval: TimeoutId | null = null

const cleanupTasks: Set<() => void> = new Set()

function cleanupHistories() {
  cleanupTasks.forEach((task) => task())
}

export function createValueHistory<Value>({
  expireDelay,
  maxEntries,
}: {
  expireDelay: number
  maxEntries?: number
}): ValueHistory<Value> {
  let entries: Array<ValueHistoryEntry<Value>> = []
  const deletedEntries: RelativeTime[] = []

  if (!cleanupHistoriesInterval) {
    cleanupHistoriesInterval = setInterval(() => cleanupHistories(), CLEAR_OLD_VALUES_INTERVAL)
  }

  const clearExpiredValues = () => {
    const oldTimeThreshold = relativeNow() - expireDelay
    while (entries.length > 0 && entries[entries.length - 1].endTime < oldTimeThreshold) {
      const entry = entries.pop()
      if (entry) {
        deletedEntries.push(entry.startTime)
      }
    }
  }

  cleanupTasks.add(clearExpiredValues)

  /**
   * Add a value to the history associated with a start time. Returns a reference to this newly
   * added entry that can be removed or closed.
   */
  function add(value: Value, startTime: RelativeTime): ValueHistoryEntry<Value> {
    const entry: ValueHistoryEntry<Value> = {
      value,
      startTime,
      endTime: END_OF_TIMES,
      remove: () => {
        removeItem(entries, entry)
      },
      close: (endTime: RelativeTime) => {
        entry.endTime = endTime
      },
    }

    if (maxEntries && entries.length >= maxEntries) {
      entries.pop()
    }

    entries.unshift(entry)

    return entry
  }

  /**
   * Return the latest value that was active during `startTime`, or the currently active value
   * if no `startTime` is provided. This method assumes that entries are not overlapping.
   *
   * If `option.returnInactive` is true, returns the value at `startTime` (active or not).
   */
  function find(
    startTime: RelativeTime = END_OF_TIMES,
    options: { returnInactive: boolean } = { returnInactive: false }
  ): Value | undefined {
    for (const entry of entries) {
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
  function closeActive(endTime: RelativeTime) {
    const latestEntry = entries[0]
    if (latestEntry && latestEntry.endTime === END_OF_TIMES) {
      latestEntry.close(endTime)
    }
  }

  /**
   * Return all values with an active period overlapping with the duration,
   * or all values that were active during `startTime` if no duration is provided,
   * or all currently active values if no `startTime` is provided.
   */
  function findAll(startTime: RelativeTime = END_OF_TIMES, duration = 0 as Duration): Value[] {
    const endTime = addDuration(startTime, duration)
    return entries
      .filter((entry) => entry.startTime <= endTime && startTime <= entry.endTime)
      .map((entry) => entry.value)
  }

  function getAllEntries() {
    return entries.map(({ startTime, endTime, value }) => ({
      startTime,
      endTime: endTime === END_OF_TIMES ? 'Infinity' : endTime,
      value,
    })) as Context[]
  }

  function getDeletedEntries() {
    return deletedEntries
  }

  /**
   * Remove all entries from this collection.
   */
  function reset() {
    entries = []
  }

  /**
   * Stop internal garbage collection of past entries.
   */
  function stop() {
    cleanupTasks.delete(clearExpiredValues)
    if (cleanupTasks.size === 0 && cleanupHistoriesInterval) {
      clearInterval(cleanupHistoriesInterval)
      cleanupHistoriesInterval = null
    }
  }

  return { add, find, closeActive, findAll, reset, stop, getAllEntries, getDeletedEntries }
}
