import { ONE_MINUTE, RelativeTime, relativeNow } from '@datadog/browser-core'

interface PreviousContext<T> {
  startTime: RelativeTime
  endTime: RelativeTime
  context: T
}

export const CLEAR_OLD_CONTEXTS_INTERVAL = ONE_MINUTE

export class ContextHistory<Raw, Built> {
  private current: Raw | undefined
  private currentStart: RelativeTime | undefined
  private previousContexts: Array<PreviousContext<Built>> = []
  private clearOldContextsInterval: number

  constructor(private buildContext: (r: Raw) => Built, private expireDelay: number) {
    this.clearOldContextsInterval = setInterval(() => this.clearOldContexts(), CLEAR_OLD_CONTEXTS_INTERVAL)
  }

  find(startTime?: RelativeTime) {
    if (startTime === undefined) {
      return this.current ? this.buildContext(this.current) : undefined
    }
    if (this.current !== undefined && this.currentStart !== undefined && startTime >= this.currentStart) {
      return this.buildContext(this.current)
    }
    for (const previousContext of this.previousContexts) {
      if (startTime > previousContext.endTime) {
        break
      }
      if (startTime >= previousContext.startTime) {
        return previousContext.context
      }
    }
    return undefined
  }

  setCurrent(current: Raw, startTime: RelativeTime) {
    this.current = current
    this.currentStart = startTime
  }

  getCurrent() {
    return this.current
  }

  clearCurrent() {
    this.current = undefined
    this.currentStart = undefined
  }

  closeCurrent(endTime: RelativeTime) {
    if (this.current !== undefined && this.currentStart !== undefined) {
      this.previousContexts.unshift({
        endTime,
        context: this.buildContext(this.current),
        startTime: this.currentStart,
      })
      this.clearCurrent()
    }
  }

  clearOldContexts() {
    const oldTimeThreshold = relativeNow() - this.expireDelay
    while (
      this.previousContexts.length > 0 &&
      this.previousContexts[this.previousContexts.length - 1].startTime < oldTimeThreshold
    ) {
      this.previousContexts.pop()
    }
  }

  reset() {
    this.clearCurrent()
    this.previousContexts = []
  }

  stop() {
    clearInterval(this.clearOldContextsInterval)
  }
}
