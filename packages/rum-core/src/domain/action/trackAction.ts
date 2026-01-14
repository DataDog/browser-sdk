import type { ClocksState, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { ONE_MINUTE, generateUUID, createValueHistory, elapsed } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import { trackEventCounts } from '../trackEventCounts'

export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface TrackedAction {
  id: string
  startClocks: ClocksState
  duration: Duration | undefined
  counts: ActionCounts
  stop: (endTime: RelativeTime) => void
  discard: () => void
}

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
}

export interface ActionTracker {
  createTrackedAction: (startClocks: ClocksState) => TrackedAction
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
  stop: () => void
}

export function startActionTracker(lifeCycle: LifeCycle): ActionTracker {
  const history = createValueHistory<string>({ expireDelay: ACTION_CONTEXT_TIME_OUT_DELAY })
  const activeEventCountSubscriptions = new Set<ReturnType<typeof trackEventCounts>>()

  const { unsubscribe: unsubscribeSessionRenewal } = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
  })

  function createTrackedAction(startClocks: ClocksState): TrackedAction {
    const id = generateUUID()
    const historyEntry: ValueHistoryEntry<string> = history.add(id, startClocks.relative)
    let stopped = false
    let duration: Duration | undefined

    const eventCountsSubscription = trackEventCounts({
      lifeCycle,
      isChildEvent: (event) =>
        event.action !== undefined &&
        (Array.isArray(event.action.id) ? event.action.id.includes(id) : event.action.id === id),
    })
    activeEventCountSubscriptions.add(eventCountsSubscription)

    function stopOrDiscard(endTime?: RelativeTime) {
      if (stopped) {
        return
      }
      stopped = true

      if (endTime !== undefined) {
        historyEntry.close(endTime)
        duration = elapsed(startClocks.relative, endTime)
      } else {
        historyEntry.remove()
      }

      eventCountsSubscription.stop()
      activeEventCountSubscriptions.delete(eventCountsSubscription)
    }

    return {
      id,
      startClocks,
      get duration() {
        return duration
      },
      get counts() {
        const { errorCount, longTaskCount, resourceCount } = eventCountsSubscription.eventCounts
        return { errorCount, longTaskCount, resourceCount }
      },
      stop: stopOrDiscard,
      discard: stopOrDiscard,
    }
  }

  function findActionId(startTime?: RelativeTime): string | string[] | undefined {
    const ids = history.findAll(startTime)
    if (ids.length === 0) {
      return undefined
    }
    return ids
  }

  function stop() {
    unsubscribeSessionRenewal()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
    history.reset()
    history.stop()
  }

  return {
    createTrackedAction,
    findActionId,
    stop,
  }
}
