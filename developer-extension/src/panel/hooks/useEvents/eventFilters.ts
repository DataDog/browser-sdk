import type { StoredEvent } from './eventCollection'

export interface EventFilters {
  sdk: Array<'rum' | 'logs'>
  query: string
}

export const DEFAULT_FILTERS: EventFilters = {
  sdk: ['rum', 'logs'],
  query: '',
}

export function applyEventFilters(filters: EventFilters, events: StoredEvent[]) {
  let filteredEvents = events

  if (!filters.sdk.includes('logs')) {
    filteredEvents = filteredEvents.filter((event) => !isLog(event))
  }

  if (!filters.sdk.includes('rum')) {
    filteredEvents = filteredEvents.filter((event) => !isRum(event))
  }

  if (filters.query) {
    const query = parseQuery(filters.query)
    filteredEvents = filteredEvents.filter(query.match)
  }

  return filteredEvents
}

function isLog(event: StoredEvent) {
  return Boolean(event.status)
}

function isRum(event: StoredEvent) {
  return !isLog(event)
}

function parseQuery(query: string) {
  const queryParts = query
    .split(' ')
    .filter((queryPart) => queryPart)
    .map((queryPart) => queryPart.split(':'))

  return {
    match: (event: StoredEvent) =>
      queryParts.every((queryPart) => matchQueryPart(event, queryPart[0], queryPart.length ? queryPart[1] : '')),
  }
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
