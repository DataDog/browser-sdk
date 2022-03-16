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

export class ContextHistory<Context> {
  private entries: Array<ContextHistoryEntry<Context>> = []
  private clearOldContextsInterval: TimeoutId

  constructor(private expireDelay: number) {
    this.clearOldContextsInterval = setInterval(() => this.clearOldContexts(), CLEAR_OLD_CONTEXTS_INTERVAL)
  }

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

  findAll(startTime: RelativeTime = END_OF_TIMES): Context[] {
    return this.entries
      .filter((entry) => entry.startTime <= startTime && startTime <= entry.endTime)
      .map((entry) => entry.context)
  }

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

  clearOldContexts() {
    const oldTimeThreshold = relativeNow() - this.expireDelay
    while (this.entries.length > 0 && this.entries[this.entries.length - 1].endTime < oldTimeThreshold) {
      this.entries.pop()
    }
  }

  reset() {
    this.entries = []
  }

  stop() {
    clearInterval(this.clearOldContextsInterval)
  }
}
