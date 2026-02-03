import type { ClocksState, Duration, RelativeTime, ValueHistoryEntry } from '@datadog/browser-core'
import { ONE_MINUTE, generateUUID, createValueHistory, elapsed, combine } from '@datadog/browser-core'
import type { RumActionEvent, RumErrorEvent, RumLongTaskEvent, RumResourceEvent } from '../rumEvent.types'
import { LifeCycleEventType } from './lifeCycle'
import type { LifeCycle } from './lifeCycle'
import type { EventCounts } from './trackEventCounts'
import { trackEventCounts } from './trackEventCounts'

export const EVENT_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

type BaseTrackedEvent<TData = object> = TData & {
  id: string
  startClocks: ClocksState
  counts?: EventCounts
}

export type StoppedEvent<TData> = BaseTrackedEvent<TData> & {
  duration: Duration
}

export type DiscardedEvent<TData> = BaseTrackedEvent<TData>

export interface StartOptions<TData> {
  isChildEvent?: (
    id: string
  ) => (event: RumActionEvent | RumErrorEvent | RumLongTaskEvent | RumResourceEvent) => boolean
  onDiscard?: (id: string, data: TData, startClocks: ClocksState) => void
}

export interface EventTracker<TData> {
  start: (key: string, startClocks: ClocksState, data: TData, options?: StartOptions<TData>) => void
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

  function discardEvent(event: TrackedEventData<TData>) {
    keyedEvents.delete(event.key)
    event.historyEntry.remove()

    event.eventCounts?.stop()

    if (event.onDiscard) {
      event.onDiscard(event.id, event.data, event.startClocks)
    }
  }

  function discardAll() {
    keyedEvents.forEach((event) => {
      discardEvent(event)
    })

    history.reset()
  }

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, discardAll)

  function start(key: string, startClocks: ClocksState, data: TData, options?: StartOptions<TData>) {
    const id = generateUUID()

    const historyEntry = history.add(id, startClocks.relative)

    const existing = keyedEvents.get(key)
    if (existing) {
      discardEvent(existing)
    }

    const eventCounts = options?.isChildEvent
      ? trackEventCounts({
          lifeCycle,
          isChildEvent: options.isChildEvent(id),
        })
      : undefined

    keyedEvents.set(key, {
      id,
      key,
      startClocks,
      data,
      historyEntry,
      eventCounts,
      onDiscard: options?.onDiscard,
    })
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
    event.eventCounts?.stop()

    return {
      ...finalData,
      id: event.id,
      startClocks: event.startClocks,
      duration,
      counts,
    }
  }

  function discard(key: string): DiscardedEvent<TData> | undefined {
    const event = keyedEvents.get(key)
    if (!event) {
      return undefined
    }

    const counts = event.eventCounts?.eventCounts

    discardEvent(event)

    return {
      ...event.data,
      id: event.id,
      startClocks: event.startClocks,
      counts,
    }
  }

  function findId(startTime?: RelativeTime): string | string[] | undefined {
    const ids = history.findAll(startTime)
    return ids.length ? ids : undefined
  }

  function stopTracker() {
    sessionRenewalSubscription.unsubscribe()
    discardAll()
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
