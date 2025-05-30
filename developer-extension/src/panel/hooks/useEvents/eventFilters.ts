import type { SdkEvent } from '../../sdkEvent'
import type { RumViewEvent } from '../../../../../packages/rum-core/src/rumEvent.types'
import { isRumViewEvent } from '../../sdkEvent'
import type { FacetRegistry } from './facetRegistry'

export interface EventFilters {
  facetValuesFilter: FacetValuesFilter
  query: string
  outdatedVersions: boolean
}

export type FacetValuesFilter = { type: 'include' | 'exclude'; facetValues: FacetValues }
export interface FacetValues {
  [facetPath: string]: string[]
}

export const DEFAULT_FILTERS: EventFilters = {
  facetValuesFilter: { type: 'exclude', facetValues: {} },
  query: '',
  outdatedVersions: false,
}

export function applyEventFilters(filters: EventFilters, events: SdkEvent[], facetRegistry: FacetRegistry) {
  let filteredEvents = events

  filteredEvents = filterFacets(filteredEvents, filters.facetValuesFilter, facetRegistry)

  if (filters.query) {
    const queryParts: string[][] = parseQuery(filters.query)
    const matchQuery = (event: SdkEvent) => {
      const includeParts = queryParts.filter((part) => part[0] === 'include')
      const excludeParts = queryParts.filter((part) => part[0] === 'exclude')

      // Check if event matches any exclude condition
      const isExcluded = excludeParts.some(([_, searchKey, searchTerm]) => {
        const restoredSearchTerm = searchTerm ? searchTerm.replaceAll(/\\\s+/gm, ' ') : ''
        return matchQueryPart(event, searchKey, restoredSearchTerm)
      })

      if (isExcluded) {
        return false
      }

      // If no include conditions, event passes
      if (includeParts.length === 0) {
        return true
      }
      // Check if event matches any include condition
      return includeParts.some(([_, searchKey, searchTerm]) => {
        const restoredSearchTerm = searchTerm ? searchTerm.replaceAll(/\\\s+/gm, ' ') : ''
        return matchQueryPart(event, searchKey, restoredSearchTerm)
      })
    }
    filteredEvents = filteredEvents.filter(matchQuery)
  }

  if (!filters.outdatedVersions) {
    filteredEvents = filterOutdatedVersions(filteredEvents)
  }

  return filteredEvents
}

export function filterFacets(
  events: SdkEvent[],
  facetValuesFilter: FacetValuesFilter,
  facetRegistry: FacetRegistry
): SdkEvent[] {
  const filteredFacetValueEntries = Object.entries(facetValuesFilter.facetValues)
  if (filteredFacetValueEntries.length === 0) {
    return events
  }
  const isIncludeType = facetValuesFilter.type === 'include'
  return events.filter((event) =>
    filteredFacetValueEntries[isIncludeType ? 'some' : 'every'](([facetPath, filteredValues]) => {
      const eventValue = facetRegistry.getFieldValueForEvent(event, facetPath)
      if (isIncludeType) {
        return filteredValues.includes(eventValue as string)
      }
      return !filteredValues.includes(eventValue as string)
    })
  )
}

function filterOutdatedVersions(events: SdkEvent[]): SdkEvent[] {
  const upToDateEvents = new Map<string, RumViewEvent>()
  const outdatedEvents = new Set<SdkEvent>()

  for (const event of events) {
    if (isRumViewEvent(event)) {
      const otherEvent = upToDateEvents.get(event.view.id)
      if (!otherEvent) {
        upToDateEvents.set(event.view.id, event)
      } else if (otherEvent._dd.document_version < event._dd.document_version) {
        upToDateEvents.set(event.view.id, event)
        outdatedEvents.add(otherEvent)
      } else {
        outdatedEvents.add(event)
      }
    }
  }

  return events.filter((event) => !outdatedEvents.has(event))
}

export function parseQuery(query: string) {
  const queryParts = query
    .split(new RegExp('(?<!\\\\)\\s', 'g')) // Hack it to escape whitespace with backslashes
    .filter((queryPart) => queryPart)
    .map((queryPart) => {
      // Handle minus sign prefix for exclude mode
      const isExclude = queryPart.startsWith('-')
      const part = isExclude ? queryPart.slice(1) : queryPart
      const [key, ...valueParts] = part.split(':')
      const value = valueParts.join(':') // Rejoin in case there are colons in the value
      return [isExclude ? 'exclude' : 'include', key, value]
    })

  return queryParts
}

export function matchWithWildcard(value: string, searchTerm: string): boolean {
  value = value.toLowerCase()
  searchTerm = searchTerm.toLowerCase()
  if (!searchTerm.includes('*')) {
    return value.includes(searchTerm)
  }
  const searchTerms = searchTerm.toLowerCase().split('*')
  let lastIndex = 0
  for (const term of searchTerms) {
    const index = value.indexOf(term, lastIndex)
    if (index === -1) {
      return false
    }
    lastIndex = index + term.length
  }
  return true
}

function matchQueryPart(json: unknown, searchKey: string, searchTerm: string, jsonPath = ''): boolean {
  // Handle special case for description field
  if (searchKey.toLowerCase() === 'description') {
    return matchWithWildcard(JSON.stringify(json), searchTerm)
  }

  // Handle special case for $eventSource field
  if (searchKey === '$eventSource') {
    const event = json as SdkEvent
    // Check for all RUM event types
    const isLogEvent = event.origin === 'logger'
    if (isLogEvent) {
      return searchTerm === 'logs'
    }
    return !isLogEvent && searchTerm === 'rum'
  }

  // Handle direct path match
  if (jsonPath.endsWith(searchKey)) {
    const value = String(json)
    return matchWithWildcard(value, searchTerm)
  }

  // Handle nested object traversal
  if (typeof json !== 'object' || json === null) {
    return false
  }

  // For arrays, check if any element matches
  if (Array.isArray(json)) {
    return json.some((item) => matchQueryPart(item, searchKey, searchTerm, jsonPath))
  }

  // For objects, check all properties
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

export function generateQueryFromFacetValues(facetValuesFilter: FacetValuesFilter): string {
  if (!facetValuesFilter.facetValues || Object.keys(facetValuesFilter.facetValues).length === 0) {
    return ''
  }

  const queryParts: string[] = []
  Object.entries(facetValuesFilter.facetValues).forEach(([facetPath, values]) => {
    values.forEach((value) => {
      // Escape whitespace in both facet path and value
      const escapedPath = facetPath.replace(/\s+/g, '\\$&')
      const escapedValue = value.replace(/\s+/g, '\\$&')
      // Add minus sign prefix for exclude mode
      const prefix = facetValuesFilter.type === 'exclude' ? '-' : ''
      queryParts.push(`${prefix}${escapedPath}:${escapedValue}`)
    })
  })

  return queryParts.join(' ')
}
