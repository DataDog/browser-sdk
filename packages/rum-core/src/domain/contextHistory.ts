import { ONE_MINUTE, ClocksState, RelativeTime, relativeNow } from '@datadog/browser-core'

interface PreviousContext<T> {
  startTime: RelativeTime
  endTime: RelativeTime
  context: T
}

export const CLEAR_OLD_CONTEXTS_INTERVAL = ONE_MINUTE

export class ContextHistory<Raw extends { startClocks: ClocksState }, Built> {
  public current: Raw | undefined
  private previousContexts: Array<PreviousContext<Built>> = []
  private clearOldContextsInterval: number

  constructor(private buildContext: (r: Raw) => Built, private expireDelay: number) {
    this.clearOldContextsInterval = setInterval(() => this.clearOldContexts(), CLEAR_OLD_CONTEXTS_INTERVAL)
  }

  find(startClocks?: ClocksState) {
    if (startClocks === undefined) {
      return this.current ? this.buildContext(this.current) : undefined
    }
    if (this.current && startClocks.relative >= this.current.startClocks.relative) {
      return this.buildContext(this.current)
    }
    for (const previousContext of this.previousContexts) {
      if (startClocks.relative > previousContext.endTime) {
        break
      }
      if (startClocks.relative >= previousContext.startTime) {
        return previousContext.context
      }
    }
    return undefined
  }

  closeCurrent(endClocks: ClocksState) {
    if (this.current) {
      this.previousContexts.unshift({
        context: this.buildContext(this.current),
        startTime: this.current.startClocks.relative,
        endTime: endClocks.relative,
      })
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
    this.current = undefined
    this.previousContexts = []
  }

  stop() {
    clearInterval(this.clearOldContextsInterval)
  }
}
