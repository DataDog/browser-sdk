import { useEffect, useRef, useState } from 'react'
import type { TelemetryEvent } from '../../../../packages/core/src/domain/telemetry'
import { generateUUID } from '../../../../packages/core/src/tools/utils'
import type { LogsEvent } from '../../../../packages/logs/src/logsEvent.types'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'
import { INTAKE_DOMAINS } from '../../common/constants'
import { listenSdkMessages } from '../backgroundScriptConnection'
import type { EventSource } from '../types'

const MAXIMUM_LOGGED_EVENTS = 1000
const MAXIMUM_DISPLAYED_EVENTS = 100

export type StoredEvent = (RumEvent | TelemetryEvent | LogsEvent) & {
  id: string
}

export interface EventFilters {
  sdk: Array<'rum' | 'logs'>
  query: string
}

export function useEvents({ preserveEvents, eventSource }: { preserveEvents: boolean; eventSource: EventSource }) {
  const [events, clearEvents] = useEventSource(eventSource)

  const [filters, setFilters] = useState<EventFilters>({
    sdk: ['rum', 'logs'],
    query: '',
  })

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

  const filteredEvents = events
    .filter((event) => filters.sdk.includes('logs') || !isLog(event))
    .filter((event) => filters.sdk.includes('rum') || !isRum(event))
    .filter((event) => !filters.query || matchQuery(filters.query, event))
    .slice(0, MAXIMUM_DISPLAYED_EVENTS)

  return {
    events: filteredEvents,
    filters,
    setFilters,
    clear: clearEvents,
  }
}

function useEventSource(eventSource: EventSource) {
  const [events, setEvents] = useState<StoredEvent[]>([])

  // Reset events when the event source changes
  const ref = useRef(eventSource)
  if (ref.current !== eventSource) {
    ref.current = eventSource
    if (events.length) {
      setEvents([])
    }
  }

  useEffect(() => {
    const listenToEvents = eventSource === 'requests' ? listenEventsFromRequests : listenEventsFromSdk
    return listenToEvents((newEvents) => {
      setEvents((oldEvents) =>
        [...newEvents, ...oldEvents]
          .sort((first: any, second: any) => second.date - first.date)
          .slice(0, MAXIMUM_LOGGED_EVENTS)
      )
    })
  }, [eventSource])

  return [events, () => setEvents([])] as const
}

function isLog(event: StoredEvent) {
  return Boolean(event.status)
}

function isRum(event: StoredEvent) {
  return !isLog(event)
}

function matchQuery(query: string, event: StoredEvent) {
  const queryParts = query
    .split(' ')
    .filter((queryPart) => queryPart)
    .map((queryPart) => queryPart.split(':'))
  return queryParts.every((queryPart) => matchQueryPart(event, queryPart[0], queryPart.length ? queryPart[1] : ''))
}

function matchQueryPart(json: unknown, searchKey: string, searchTerm: string, jsonPath = ''): boolean {
  if (jsonPath.endsWith(searchKey) && String(json).startsWith(searchTerm)) {
    return true
  }

  if (typeof json !== 'object') {
    return false
  }

  for (const key in json) {
    if (
      Object.prototype.hasOwnProperty.call(json, key) &&
      matchQueryPart((json as any)[key], searchKey, searchTerm, jsonPath ? `${jsonPath}.${key}` : key)
    ) {
      return true
    }
  }

  return false
}

function listenEventsFromRequests(callback: (events: StoredEvent[]) => void) {
  function beforeRequestHandler(request: chrome.devtools.network.Request) {
    const url = new URL(request.request.url)

    if (!INTAKE_DOMAINS.find((rootDomain) => url.hostname.endsWith(rootDomain))) {
      return
    }
    // intake request path is /api/vX/track
    if (!['rum', 'logs'].includes(url.pathname.split('/')[3])) {
      return
    }
    if (!request.request.postData || !request.request.postData.text) {
      return
    }

    const decodedBody = request.request.postData.text
    const rawEvents = decodedBody.split('\n')
    const events = rawEvents.map((rawEvent) => ({ ...JSON.parse(rawEvent), id: generateUUID() } as StoredEvent))

    callback(events)
  }

  chrome.devtools.network.onRequestFinished.addListener(beforeRequestHandler)

  return () => chrome.devtools.network.onRequestFinished.removeListener(beforeRequestHandler)
}

function listenEventsFromSdk(events: (events: StoredEvent[]) => void) {
  return listenSdkMessages((message) => {
    if (message.type === 'logs' || message.type === 'rum' || message.type === 'telemetry') {
      events([{ ...message.payload, id: generateUUID() }])
    }
  })
}
