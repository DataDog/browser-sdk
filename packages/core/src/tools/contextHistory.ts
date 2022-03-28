import type { RelativeTime } from './timeUtils'
import { relativeNow } from './timeUtils'
import type { TimeoutId } from './utils'
import { ONE_MINUTE } from './utils'

const END_OF_TIMES = Infinity as RelativeTime

export interface ContextHistoryEntry<T> {
  startTime: RelativeTime
  endTime: RelativeTime
  context: T
  remove(): void
  close(endTime: RelativeTime): void
}

export const CLEAR_OLD_CONTEXTS_INTERVAL = ONE_MINUTE

/**
 * Store and keep track of contexts spans. This whole class assumes that contexts are added in
 * chronological order (i.e. all entries have an increasing start time).
 */
export class ContextHistory<Context> {
  private entries: Array<ContextHistoryEntry<Context>> = []
  private clearOldContextsInterval: TimeoutId

  constructor(private expireDelay: number) {
    this.clearOldContextsInterval = setInterval(() => this.clearOldContexts(), CLEAR_OLD_CONTEXTS_INTERVAL)
  }

  /**
   * Add a context to the history associated with a start time. Returns a reference to this newly
   * added entry that can be removed or closed.
   */
  add(context: Context, startTime: RelativeTime): ContextHistoryEntry<Context> {
    const entry: ContextHistoryEntry<Context> = {
      context,
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
   * Return the latest context that was active during `startTime`, or the currently active context
   * if no `startTime` is provided. This method assumes that entries are not overlapping.
   */
  find(startTime: RelativeTime = END_OF_TIMES): Context | undefined {
    for (const entry of this.entries) {
      if (entry.startTime <= startTime) {
        if (startTime <= entry.endTime) {
          return entry.context
        }
        break
      }
    }
  }

  /**
   * Helper function to close the currently active context, if any. This method assumes that entries
   * are not overlapping.
   */
  closeActive(endTime: RelativeTime) {
    const latestEntry = this.entries[0]
    if (latestEntry && latestEntry.endTime === END_OF_TIMES) {
      latestEntry.close(endTime)
    }
  }

  /**
   * Return all contexts that were active during `startTime`, or all currently active contexts if no
   * `startTime` is provided.
   */
  findAll(startTime: RelativeTime = END_OF_TIMES): Context[] {
    return this.entries
      .filter((entry) => entry.startTime <= startTime && startTime <= entry.endTime)
      .map((entry) => entry.context)
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
    clearInterval(this.clearOldContextsInterval)
  }

  private clearOldContexts() {
    const oldTimeThreshold = relativeNow() - this.expireDelay
    while (this.entries.length > 0 && this.entries[this.entries.length - 1].endTime < oldTimeThreshold) {
      this.entries.pop()
    }
  }
}
