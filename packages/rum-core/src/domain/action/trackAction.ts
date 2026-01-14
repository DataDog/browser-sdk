import type { ClocksState, Context, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { ONE_MINUTE, generateUUID, createValueHistory, elapsed } from '@datadog/browser-core'
import { LifeCycleEventType } from '../lifeCycle'
import type { LifeCycle } from '../lifeCycle'
import type { EventCounts } from '../trackEventCounts'
import { trackEventCounts } from '../trackEventCounts'
import type { ActionType } from '../../rawRumEvent.types'

export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export type ActionCounts = EventCounts

export interface TrackedActionMetadata {
  name?: string
  type?: ActionType
  context?: Context
  actionKey?: string
}

export interface TrackedAction extends TrackedActionMetadata {
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
  createTrackedAction: (startClocks: ClocksState, metadata?: TrackedActionMetadata) => TrackedAction
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
  stop: () => void
}

export function startActionTracker(lifeCycle: LifeCycle): ActionTracker {
  const history = createValueHistory<string>({ expireDelay: ACTION_CONTEXT_TIME_OUT_DELAY })
  const activeSubs = new Set<ReturnType<typeof trackEventCounts>>()

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
    activeSubs.forEach((s) => s.stop())
    activeSubs.clear()
  })

  function createTrackedAction(startClocks: ClocksState, metadata?: TrackedActionMetadata): TrackedAction {
    const id = generateUUID()
    const historyEntry: ValueHistoryEntry<string> = history.add(id, startClocks.relative)
    let duration: Duration | undefined

    const sub = trackEventCounts({
      lifeCycle,
      isChildEvent: (event) =>
        event.action !== undefined &&
        (Array.isArray(event.action.id) ? event.action.id.includes(id) : event.action.id === id),
    })
    activeSubs.add(sub)

    function cleanup() {
      sub.stop()
      activeSubs.delete(sub)
    }

    return {
      id,
      startClocks,
      ...metadata,
      get duration() {
        return duration
      },
      get counts() {
        return sub.eventCounts
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
    activeSubs.forEach((s) => s.stop())
    activeSubs.clear()
    history.reset()
    history.stop()
  }

  return { createTrackedAction, findActionId, stop }
}
