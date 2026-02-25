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

export interface StartOptions {
  isChildEvent?: (
    id: string
  ) => (event: RumActionEvent | RumErrorEvent | RumLongTaskEvent | RumResourceEvent) => boolean
}

export interface EventTracker<TData> {
  start: (key: string, startClocks: ClocksState, data: TData, options?: StartOptions) => void
  stop: (key: string, stopClocks: ClocksState, data?: Partial<TData>) => StoppedEvent<TData> | undefined
  discard: (key: string) => DiscardedEvent<TData> | undefined
  getCounts: (key: string) => EventCounts | undefined
  findId: (startTime?: RelativeTime) => string[]
  stopAll: () => void
}

interface TrackedEventData<TData> {
  id: string
  key: string
  startClocks: ClocksState
  data: TData
  historyEntry: ValueHistoryEntry<string>
  eventCounts?: ReturnType<typeof trackEventCounts>
}

export function startEventTracker<TData>(lifeCycle: LifeCycle): EventTracker<TData> {
  // Used by actions to associate events with actions.
  const history = createValueHistory<string>({ expireDelay: EVENT_CONTEXT_TIME_OUT_DELAY })
  // Used by manual actions and resources that use named keys to match the start and stop calls.
  const keyedEvents = new Map<string, TrackedEventData<TData>>()

  function cleanUpEvent(event: TrackedEventData<TData>) {
    keyedEvents.delete(event.key)

    event.eventCounts?.stop()
  }

  function discardAll() {
    keyedEvents.forEach((event) => {
      cleanUpEvent(event)
    })

    history.reset()
  }

  const sessionRenewalSubscription = lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, discardAll)

  function start(key: string, startClocks: ClocksState, data: TData, options?: StartOptions) {
    const id = generateUUID()

    const historyEntry = history.add(id, startClocks.relative)

    const existing = keyedEvents.get(key)
    if (existing) {
      cleanUpEvent(existing)
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
    })
  }

  function stop(key: string, stopClocks: ClocksState, extraData?: Partial<TData>): StoppedEvent<TData> | undefined {
    const event = keyedEvents.get(key)
    if (!event) {
      return undefined
    }

    const finalData = extraData ? (combine(event.data, extraData) as TData) : event.data

    event.historyEntry.close(stopClocks.relative)

    const duration = elapsed(event.startClocks.timeStamp, stopClocks.timeStamp)

    const counts = event.eventCounts?.eventCounts

    cleanUpEvent(event)

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

    cleanUpEvent(event)

    event.historyEntry.remove()

    return {
      ...event.data,
      id: event.id,
      startClocks: event.startClocks,
      counts,
    }
  }

  function findId(startTime?: RelativeTime): string[] {
    return history.findAll(startTime)
  }

  function getCounts(key: string): EventCounts | undefined {
    return keyedEvents.get(key)?.eventCounts?.eventCounts
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
    getCounts,
    findId,
    stopAll: stopTracker,
  }
}
