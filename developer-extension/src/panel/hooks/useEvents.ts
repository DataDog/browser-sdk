import { useEffect, useState } from 'react'
import { generateUUID } from '../../../../packages/core/src/tools/utils'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'
import type { LogsEvent } from '../../../../packages/logs/src/logsEvent.types'

const MAXIMUM_LOGGED_EVENTS = 1000
const MAXIMUM_DISPLAYED_EVENTS = 100

export type StoredEvent = (RumEvent | LogsEvent) & {
  id: string
}

export interface EventFilters {
  sdk: 'rum' | 'logs'
  query: string
}

export function useEvents() {
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [filters, setFilters] = useState<EventFilters>({
    sdk: 'rum',
    query: '',
  })

  useEffect(
    () =>
      listenRequests((newEvents) => {
        setEvents((oldEvents) =>
          [...newEvents, ...oldEvents]
            .sort((first: any, second: any) => second.date - first.date)
            .slice(0, MAXIMUM_LOGGED_EVENTS)
        )
      }),
    []
  )

  const filteredEvents = events
    .filter((event) => (filters.sdk === 'logs' ? event.status : !event.status))
    .filter((event) => !filters.query || matchQuery(filters.query, event))
    .slice(0, MAXIMUM_DISPLAYED_EVENTS)

  return { events: filteredEvents, filters, setFilters, clear: () => setEvents([]) }
}

function matchQuery(query: string, event: StoredEvent) {
  const queryParts = query
    .split(' ')
    .filter((queryPart) => queryPart)
    .map((queryPart) => queryPart.split(':'))
  return queryParts.every((queryPart) => matchQueryPart(event, queryPart[0], queryPart.length ? queryPart[1] : ''))
}

function matchQueryPart(json: unknown, searchKey: string, searchTerm: string, jsonPath = ''): boolean {
  if (jsonPath.endsWith(searchKey) && String(json).startsWith(searchTerm)) return true

  if (typeof json !== 'object') return false

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

function listenRequests(callback: (events: StoredEvent[]) => void) {
  function beforeRequestHandler(request: chrome.devtools.network.Request) {
    const url = new URL(request.request.url)

    const intake = /^(rum|logs).browser-intake-/.exec(url.hostname)
    if (!intake) {
      return
    }
    if (!request.request.postData || !request.request.postData.text) {
      return
    }

    const rawBody = request.request.postData.text

    const decodedBody = rawBody
    const rawEvents = decodedBody.split('\n')
    const events = rawEvents.map((rawEvent) => ({ ...JSON.parse(rawEvent), id: generateUUID() } as StoredEvent))

    callback(events)
  }

  chrome.devtools.network.onRequestFinished.addListener(beforeRequestHandler)

  return () => chrome.devtools.network.onRequestFinished.removeListener(beforeRequestHandler)
}
