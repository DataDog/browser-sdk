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
  return events
    .filter((event) => filters.sdk.includes('logs') || !isLog(event))
    .filter((event) => filters.sdk.includes('rum') || !isRum(event))
    .filter((event) => !filters.query || matchQuery(filters.query, event))
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
