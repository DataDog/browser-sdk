import { useEffect, useRef, useState } from 'react'
import type { SdkEvent } from '../../sdkEvent'
import type { EventCollectionStrategy } from '../../../common/extension.types'
import type { EventFilters } from './eventFilters'
import { DEFAULT_FILTERS, applyEventFilters } from './eventFilters'
import type { EventCollection } from './eventCollection'
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

  const eventCollectionRef = useRef<EventCollection>(null)

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
        if (details.transitionType === 'reload' && details.tabId === chrome.devtools.inspectedWindow.tabId) {
          clearEvents()
        }
      }
      chrome.webNavigation.onCommitted.addListener(clearCurrentEvents)
      return () => {
        chrome.webNavigation.onCommitted.removeListener(clearCurrentEvents)
      }
    }
  }, [preserveEvents])

  const facetRegistry = eventCollectionRef.current?.facetRegistry
  return {
    events: facetRegistry
      ? applyEventFilters(filters, events, facetRegistry).slice(0, MAXIMUM_DISPLAYED_EVENTS)
      : events,
    filters,
    setFilters,
    clear: clearEvents,
    facetRegistry,
  }
}
