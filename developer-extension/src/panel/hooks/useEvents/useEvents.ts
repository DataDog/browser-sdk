import { useEffect, useRef, useState } from 'react'
import type { SdkEvent } from '../../sdkEvent'
import type { EventFilters } from './eventFilters'
import { DEFAULT_FILTERS, applyEventFilters } from './eventFilters'
import type { EventCollection, EventCollectionStrategy } from './eventCollection'
import { startEventCollection } from './eventCollection'

const MAXIMUM_DISPLAYED_EVENTS = 100

export function useEvents({
  preserveEvents,
  eventCollectionStrategy,
}: {
  preserveEvents: boolean
  eventCollectionStrategy: EventCollectionStrategy
}) {
  const [events, setEvents] = useState<SdkEvent[]>([])
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_FILTERS)

  const eventCollectionRef = useRef<EventCollection>()

  function clearEvents() {
    eventCollectionRef.current?.clear()
  }

  useEffect(() => {
    const eventCollection = startEventCollection(eventCollectionStrategy, setEvents)
    eventCollectionRef.current = eventCollection
    return () => eventCollection.stop()
  }, [eventCollectionStrategy])

  useEffect(() => {
    if (!preserveEvents) {
      const clearCurrentEvents = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
        if (details.transitionType === 'reload') {
          clearEvents()
        }
      }
      chrome.webNavigation.onCommitted.addListener(clearCurrentEvents)
      return () => {
        chrome.webNavigation.onCommitted.removeListener(clearCurrentEvents)
      }
    }
  }, [preserveEvents])

  return {
    events: applyEventFilters(filters, events).slice(0, MAXIMUM_DISPLAYED_EVENTS),
    filters,
    setFilters,
    clear: clearEvents,
  }
}
