import type { ClocksState, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { ONE_MINUTE, generateUUID, createValueHistory, elapsed, combine } from '@datadog/browser-core'
import { LifeCycleEventType } from './lifeCycle'
import type { LifeCycle } from './lifeCycle'
import type { EventCounts } from './trackEventCounts'
import { trackEventCounts } from './trackEventCounts'

export const EVENT_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

interface BaseTrackedEvent<TData = object> {
  id: string
  key: string
  startClocks: ClocksState
  counts?: EventCounts
  data: TData
}

export interface StoppedEvent<TData> extends BaseTrackedEvent<TData> {
  duration: Duration
}

export type DiscardedEvent<TData> = BaseTrackedEvent<TData>

export interface StartOptions<TData> {
  trackCounts?: boolean
  onDiscard?: (id: string, data: TData, startClocks: ClocksState) => void
}

export interface EventTracker<TData> {
  start: (key: string, startClocks: ClocksState, data: TData, options?: StartOptions<TData>) => string
  stop: (key: string, stopClocks: ClocksState, data?: Partial<TData>) => StoppedEvent<TData> | undefined
  discard: (key: string) => DiscardedEvent<TData> | undefined
  findId: (startTime?: RelativeTime) => string | string[] | undefined
  stopAll: () => void
}

interface TrackedEventData<TData> {
  id: string
  key: string
  startClocks: ClocksState
  data: TData
  historyEntry: ValueHistoryEntry<string>
  eventCounts?: ReturnType<typeof trackEventCounts>
  onDiscard?: (id: string, data: TData, startClocks: ClocksState) => void
}

export function startEventTracker<TData>(lifeCycle: LifeCycle): EventTracker<TData> {
  // Used by actions to associate events with actions.
  const history = createValueHistory<string>({ expireDelay: EVENT_CONTEXT_TIME_OUT_DELAY })
  // Used by manual actions and resources that use named keys to match the start and stop calls.
  const keyedEvents = new Map<string, TrackedEventData<TData>>()
  // Track active events counts subscriptions for cleanup.
  const activeEventCountSubscriptions = new Set<ReturnType<typeof trackEventCounts>>()

  function discardEvent(event: TrackedEventData<TData>) {
    event.historyEntry.remove()

    if (event.eventCounts) {
      event.eventCounts.stop()
      activeEventCountSubscriptions.delete(event.eventCounts)
    }

    if (event.onDiscard) {
      event.onDiscard(event.id, event.data, event.startClocks)
    }
  }

  function stopAll() {
    keyedEvents.forEach((event) => {
      discardEvent(event)
    })
    keyedEvents.clear()

    activeEventCountSubscriptions.forEach((sub) => sub.stop())
    activeEventCountSubscriptions.clear()

    history.reset()
  }

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, stopAll)

  function start(key: string, startClocks: ClocksState, data: TData, options?: StartOptions<TData>): string {
    const id = generateUUID()

    const historyEntry = history.add(id, startClocks.relative)

    const existing = keyedEvents.get(key)
    if (existing) {
      discardEvent(existing)
      keyedEvents.delete(key)
    }

    const eventCounts =
      options?.trackCounts === true
        ? trackEventCounts({
            lifeCycle,
            isChildEvent: (event) =>
              event.action !== undefined &&
              (Array.isArray(event.action.id) ? event.action.id.includes(id) : event.action.id === id),
          })
        : undefined

    if (eventCounts) {
      activeEventCountSubscriptions.add(eventCounts)
    }

    keyedEvents.set(key, {
      id,
      key,
      startClocks,
      data,
      historyEntry,
      eventCounts,
      onDiscard: options?.onDiscard,
    })

    return key
  }

  function stop(key: string, stopClocks: ClocksState, extraData?: Partial<TData>): StoppedEvent<TData> | undefined {
    const event = keyedEvents.get(key)
    if (!event) {
      return undefined
    }

    const finalData = extraData ? (combine(event.data, extraData) as TData) : event.data

    event.historyEntry.close(stopClocks.relative)

    const duration = elapsed(event.startClocks.relative, stopClocks.relative)

    const counts = event.eventCounts?.eventCounts

    keyedEvents.delete(key)
    if (event.eventCounts) {
      event.eventCounts.stop()
      activeEventCountSubscriptions.delete(event.eventCounts)
    }

    return {
      id: event.id,
      key: event.key,
      startClocks: event.startClocks,
      duration,
      counts,
      data: finalData,
    }
  }

  function discard(key: string): DiscardedEvent<TData> | undefined {
    const event = keyedEvents.get(key)
    if (!event) {
      return undefined
    }

    const counts = event.eventCounts?.eventCounts

    keyedEvents.delete(key)
    discardEvent(event)

    return {
      id: event.id,
      key: event.key,
      startClocks: event.startClocks,
      counts,
      data: event.data,
    }
  }

  function findId(startTime?: RelativeTime): string | string[] | undefined {
    const ids = history.findAll(startTime)
    return ids.length ? ids : undefined
  }

  function stopTracker() {
    sessionRenewalSubscription.unsubscribe()
    stopAll()
    history.stop()
  }

  return {
    start,
    stop,
    discard,
    findId,
    stopAll: stopTracker,
  }
}
