import type { SdkEvent } from '../../sdkEvent'
import type { RumViewEvent } from '../../../../../packages/rum-core/src/rumEvent.types'
import { isRumViewEvent } from '../../sdkEvent'
import type { FieldMultiValue } from '../../facets.constants'
import type { FacetRegistry } from './facetRegistry'

export interface EventFilters {
  excludedFacetValues: ExcludedFacetValues
  query: string
  outdatedVersions: boolean
}

export interface ExcludedFacetValues {
  [facetPath: string]: string[]
}

export const DEFAULT_FILTERS: EventFilters = {
  excludedFacetValues: {},
  query: '',
  outdatedVersions: false,
}

export function applyEventFilters(filters: EventFilters, events: SdkEvent[], facetRegistry: FacetRegistry) {
  let filteredEvents = events

  filteredEvents = filterExcludedFacets(filteredEvents, filters.excludedFacetValues, facetRegistry)

  if (filters.query) {
    const query = parseQuery(filters.query)
    filteredEvents = filteredEvents.filter(query.match)
  }

  if (!filters.outdatedVersions) {
    filteredEvents = filterOutdatedVersions(filteredEvents)
  }

  return filteredEvents
}

function filterExcludedFacets(
  events: SdkEvent[],
  excludedFacetValues: ExcludedFacetValues,
  facetRegistry: FacetRegistry
): SdkEvent[] {
  return events.filter(
    (event) =>
      !Object.entries(excludedFacetValues).some(([facetPath, excludedValues]) =>
        (excludedValues as Array<FieldMultiValue | undefined>).includes(
          facetRegistry.getFieldValueForEvent(event, facetPath)
        )
      )
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

function parseQuery(query: string) {
  const queryParts = query
    .split(/(?<!\\)\s/gm) // Hack it to escape whitespace with backslashes
    .filter((queryPart) => queryPart)
    .map((queryPart) => queryPart.split(':'))

  return {
    match: (event: SdkEvent) =>
      queryParts.every((queryPart) => {
        // Hack it to restore the whitespace
        const searchTerm = queryPart.length > 1 ? queryPart[1].replaceAll(/\\\s+/gm, ' ') : ''
        return matchQueryPart(event, queryPart[0], searchTerm)
      }),
  }
}

function matchWithWildcard(value: string, searchTerm: string): boolean {
  value = value.toLowerCase()
  if (!searchTerm.includes('*')) {
    return value === searchTerm
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
  if (searchKey.toLowerCase() === 'description') {
    return matchWithWildcard(JSON.stringify(json), searchTerm)
  }
  if (jsonPath.endsWith(searchKey) && matchWithWildcard(String(json), searchTerm)) {
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
