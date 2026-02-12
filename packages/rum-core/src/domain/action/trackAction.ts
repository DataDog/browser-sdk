import type { ClocksState, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, generateUUID, createValueHistory, elapsed } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import type { EventCounts } from '../trackEventCounts'
import { trackEventCounts } from '../trackEventCounts'

export const ACTION_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export type ActionCounts = EventCounts

export interface TrackedAction {
  id: string
  startClocks: ClocksState
  duration: Duration | undefined
  counts: ActionCounts
  stop: (endTime: RelativeTime) => void
  discard: () => void
}

export interface ActionContext {
  id: string
  label: string
  duration: Duration
  startClocks: ClocksState
}

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
  findActions: (startTime: RelativeTime, duration: Duration) => ActionContext[]
}

export interface ActionTracker {
  createTrackedAction: (startClocks: ClocksState, actionName: string) => TrackedAction
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
  findActions: (startTime: RelativeTime, duration: Duration) => ActionContext[]
  stop: () => void
}

export function startActionTracker(lifeCycle: LifeCycle): ActionTracker {
  const history = createValueHistory<ActionContext>({ expireDelay: ACTION_CONTEXT_TIME_OUT_DELAY })
  const activeEventCountSubscriptions = new Set<ReturnType<typeof trackEventCounts>>()

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
  })

  function createTrackedAction(startClocks: ClocksState, actionName: string): TrackedAction {
    const id = generateUUID()
    const historyEntry: ValueHistoryEntry<ActionContext> = history.add(
      { id, label: actionName, duration: 0 as Duration, startClocks },
      startClocks.relative
    )
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
        historyEntry.value.duration = duration
        cleanup()
      },
      discard() {
        historyEntry.remove()
        cleanup()
      },
    }
  }

  function findActionId(startTime?: RelativeTime): string | string[] | undefined {
    const actionContexts = history.findAll(startTime)
    return actionContexts.length ? actionContexts.map(({ id }) => id) : undefined
  }

  function findActions(startTime: RelativeTime, duration: Duration) {
    return history.findAll(startTime, duration)
  }

  function stop() {
    sessionRenewalSubscription.unsubscribe()
    activeEventCountSubscriptions.forEach((subscription) => subscription.stop())
    activeEventCountSubscriptions.clear()
    history.reset()
    history.stop()
  }

  return { createTrackedAction, findActionId, findActions, stop }
}
