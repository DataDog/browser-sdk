import type { ClocksState, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { ONE_MINUTE, generateUUID, createValueHistory, elapsed } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import type { EventCounts } from '../trackEventCounts'
import { trackEventCounts } from '../trackEventCounts'

export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export type ActionCounts = EventCounts

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

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
  })

  function createTrackedAction(startClocks: ClocksState): TrackedAction {
    const id = generateUUID()
    const historyEntry: ValueHistoryEntry<string> = history.add(id, startClocks.relative)
    let duration: Duration | undefined

    const eventCountsSubscription = trackEventCounts({
      lifeCycle,
      isChildEvent: (event) =>
        event.action !== undefined &&
        (Array.isArray(event.action.id) ? event.action.id.includes(id) : event.action.id === id),
    })
    activeEventCountSubscriptions.add(eventCountsSubscription)

    function cleanup() {
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
        return eventCountsSubscription.eventCounts
      },
      stop(endTime: RelativeTime) {
        historyEntry.close(endTime)
        duration = elapsed(startClocks.relative, endTime)
        cleanup()
      },
      discard() {
        historyEntry.remove()
        cleanup()
      },
    }
  }

  function findActionId(startTime?: RelativeTime): string | string[] | undefined {
    const ids = history.findAll(startTime)
    return ids.length ? ids : undefined
  }

  function stop() {
    sessionRenewalSubscription.unsubscribe()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
    history.reset()
    history.stop()
  }

  return { createTrackedAction, findActionId, stop }
}
