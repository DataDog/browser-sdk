import type { SdkEvent } from '../../sdkEvent'
import { isLogEvent, isRumEvent, isTelemetryEvent } from '../../sdkEvent'

export interface EventFilters {
  sdk: Array<'rum' | 'logs' | 'telemetry'>
  query: string
}

export const DEFAULT_FILTERS: EventFilters = {
  sdk: ['rum', 'logs', 'telemetry'],
  query: '',
}

export function applyEventFilters(filters: EventFilters, events: SdkEvent[]) {
  let filteredEvents = events

  if (!filters.sdk.includes('logs')) {
    filteredEvents = filteredEvents.filter((event) => !isLogEvent(event))
  }

  if (!filters.sdk.includes('rum')) {
    filteredEvents = filteredEvents.filter((event) => !isRumEvent(event))
  }

  if (!filters.sdk.includes('telemetry')) {
    filteredEvents = filteredEvents.filter((event) => !isTelemetryEvent(event))
  }

  if (filters.query) {
    const query = parseQuery(filters.query)
    filteredEvents = filteredEvents.filter(query.match)
  }

  return filteredEvents
}

function parseQuery(query: string) {
  const queryParts = query
    .split(' ')
    .filter((queryPart) => queryPart)
    .map((queryPart) => queryPart.split(':'))

  return {
    match: (event: SdkEvent) =>
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
