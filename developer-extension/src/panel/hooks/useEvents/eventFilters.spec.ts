import { isSafari } from '../../../../../packages/core/src/tools/utils/browserDetection'
import {
  RUM_ACTION_EVENT,
  RUM_ERROR_EVENT,
  RUM_XHR_RESOURCE_EVENT,
  LOGS_EVENT,
  RUM_BEACON_EVENT,
} from '../../test/events'
import {
  parseQuery,
  matchWithWildcard,
  filterFacets,
  generateQueryFromFacetValues,
  applyEventFilters,
  DEFAULT_FILTERS,
} from './eventFilters'
import type { FacetValuesFilter } from './eventFilters'
import { FacetRegistry } from './facetRegistry'

if (!isSafari()) {
  describe('filterFacets', () => {
    const facetRegistry = new FacetRegistry()
    facetRegistry.addEvent(RUM_ACTION_EVENT)
    facetRegistry.addEvent(RUM_ERROR_EVENT)
    facetRegistry.addEvent(RUM_ERROR_EVENT)
    facetRegistry.addEvent(RUM_XHR_RESOURCE_EVENT)
    facetRegistry.addEvent(LOGS_EVENT)

    it('should exclude selected facets when in exclusion mode', () => {
      expect(
        filterFacets(
          [RUM_ACTION_EVENT, RUM_ERROR_EVENT, RUM_ERROR_EVENT],
          { type: 'exclude', facetValues: { type: ['error'] } } as FacetValuesFilter,
          facetRegistry
        )
      ).toEqual([RUM_ACTION_EVENT])
    })
    it('should exclude unselected facets when in inclusion mode', () => {
      expect(
        filterFacets(
          [RUM_ACTION_EVENT, RUM_ERROR_EVENT, RUM_ERROR_EVENT],
          { type: 'include', facetValues: { type: ['error'] } } as FacetValuesFilter,
          facetRegistry
        )
      ).toEqual([RUM_ERROR_EVENT, RUM_ERROR_EVENT])
    })
    it('should include selected facets at different levels in inclusion mode', () => {
      expect(
        filterFacets(
          [RUM_ACTION_EVENT, RUM_ERROR_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT],
          {
            type: 'include',
            facetValues: {
              type: ['action'],
              'resource.type': ['xhr'],
            },
          } as FacetValuesFilter,
          facetRegistry
        )
      ).toEqual([RUM_ACTION_EVENT, RUM_XHR_RESOURCE_EVENT])
    })
    it('should exclude facets at different levels in exclusion mode', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'exclude',
        facetValues: {
          type: ['action', 'resource', 'view'],
          $eventSource: ['logs'],
        },
      }
      expect(filterFacets([RUM_ACTION_EVENT, RUM_ERROR_EVENT, LOGS_EVENT], facetValuesFilter, facetRegistry)).toEqual([
        RUM_ERROR_EVENT,
      ])
    })
  })

  describe('parseQuery', () => {
    it('return a simple field', () => {
      expect(parseQuery('foo:bar')).toEqual([['include', 'foo', 'bar']])
    })
    it('return intermediary fields', () => {
      expect(parseQuery('foo.bar:baz')).toEqual([['include', 'foo.bar', 'baz']])
    })
    it('return multiple fields', () => {
      expect(parseQuery('foo:bar baz:qux')).toEqual([
        ['include', 'foo', 'bar'],
        ['include', 'baz', 'qux'],
      ])
    })
    it('parse escaped whitespace with backslashes in search terms', () => {
      expect(parseQuery('foo:bar\\ baz')).toEqual([['include', 'foo', 'bar\\ baz']])
    })
    it('parse escaped whitespace with backslashes in keys', () => {
      expect(parseQuery('foo\\ bar:baz')).toEqual([['include', 'foo\\ bar', 'baz']])
    })
    it('return multiple fields with escaped whitespace', () => {
      expect(parseQuery('foo\\ bar:baz\\ qux')).toEqual([['include', 'foo\\ bar', 'baz\\ qux']])
      expect(parseQuery('foo:bar\\ baz qux:quux\\ corge')).toEqual([
        ['include', 'foo', 'bar\\ baz'],
        ['include', 'qux', 'quux\\ corge'],
      ])
    })
    it('should parse simple queries', () => {
      expect(parseQuery('resource.type:beacon')).toEqual([['include', 'resource.type', 'beacon']])
    })
    it('should parse queries with multiple values for the same field', () => {
      expect(parseQuery('resource.type:beacon resource.type:xhr resource.type:image')).toEqual([
        ['include', 'resource.type', 'beacon'],
        ['include', 'resource.type', 'xhr'],
        ['include', 'resource.type', 'image'],
      ])
    })
    it('should parse queries with exclude prefix', () => {
      expect(parseQuery('-resource.type:beacon')).toEqual([['exclude', 'resource.type', 'beacon']])
    })
    it('should parse mixed include and exclude queries', () => {
      expect(parseQuery('resource.type:beacon -resource.type:xhr')).toEqual([
        ['include', 'resource.type', 'beacon'],
        ['exclude', 'resource.type', 'xhr'],
      ])
    })
    it('should handle values with colons', () => {
      expect(parseQuery('url:https://example.com:8080')).toEqual([['include', 'url', 'https://example.com:8080']])
    })
  })

  describe('matchWithWildcard', () => {
    it('matches exact strings', () => {
      expect(matchWithWildcard('foo', 'foo')).toBe(true)
    })
    it('matches exact strings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'FOO')).toBe(true)
    })
    it('matches substrings', () => {
      expect(matchWithWildcard('foo', 'oo')).toBe(true)
    })
    it('matches substrings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'OO')).toBe(true)
    })
    it('does not match missing substrings', () => {
      expect(matchWithWildcard('foo', 'bar')).toBe(false)
    })
    it('does not match missing substrings case-insensitively', () => {
      expect(matchWithWildcard('foo', 'BAR')).toBe(false)
    })
    it('matches with wildcard at the beginning', () => {
      expect(matchWithWildcard('foo', '*oo')).toBe(true)
    })
    it('matches with wildcard at the end', () => {
      expect(matchWithWildcard('foo', 'fo*')).toBe(true)
    })
    it('matches with wildcard at the beginning and the end', () => {
      expect(matchWithWildcard('foo', '*o*')).toBe(true)
    })
    it('matches with wildcard at the beginning and the end case-insensitively', () => {
      expect(matchWithWildcard('foo', '*O*')).toBe(true)
    })
    it('does not match missing substrings with wildcard at the beginning', () => {
      expect(matchWithWildcard('foo', '*bar')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the end', () => {
      expect(matchWithWildcard('foo', 'bar*')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the beginning and the end', () => {
      expect(matchWithWildcard('foo', '*bar*')).toBe(false)
    })
    it('does not match missing substrings with wildcard at the beginning and the end case-insensitively', () => {
      expect(matchWithWildcard('foo', '*BAR*')).toBe(false)
    })
  })

  describe('applyEventFilters with query', () => {
    const facetRegistry = new FacetRegistry()
    facetRegistry.addEvent(RUM_ACTION_EVENT)
    facetRegistry.addEvent(RUM_ERROR_EVENT)
    facetRegistry.addEvent(RUM_XHR_RESOURCE_EVENT)
    facetRegistry.addEvent(LOGS_EVENT)

    it('should filter events by resource type', () => {
      const filters = {
        ...DEFAULT_FILTERS,
        query: 'resource.type:beacon',
      }
      const result = applyEventFilters(
        filters,
        [RUM_BEACON_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT],
        facetRegistry
      )
      expect(result).toEqual([RUM_BEACON_EVENT])
    })

    it('should filter events by multiple quries', () => {
      const filters = {
        ...DEFAULT_FILTERS,
        query: 'action.type:click resource.type:xhr',
      }
      const result = applyEventFilters(
        filters,
        [RUM_ACTION_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT],
        facetRegistry
      )
      expect(result).toEqual([RUM_ACTION_EVENT, RUM_XHR_RESOURCE_EVENT])
    })

    it('should handle exclude queries', () => {
      const filters = {
        ...DEFAULT_FILTERS,
        query: '-resource.type:beacon',
      }
      const result = applyEventFilters(
        filters,
        [RUM_BEACON_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT],
        facetRegistry
      )
      expect(result).toEqual([RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT])
    })

    it('should handle mixed include and exclude queries', () => {
      const filters = {
        ...DEFAULT_FILTERS,
        query: 'type:resource -resource.type:xhr',
      }
      const result = applyEventFilters(
        filters,
        [RUM_BEACON_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT],
        facetRegistry
      )
      expect(result).toEqual([RUM_BEACON_EVENT])
    })

    it('should filter events by event source', () => {
      const filters = {
        ...DEFAULT_FILTERS,
        query: '$eventSource:rum',
      }
      const result = applyEventFilters(
        filters,
        [RUM_BEACON_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT, LOGS_EVENT],
        facetRegistry
      )
      expect(result).toEqual([RUM_BEACON_EVENT, RUM_ERROR_EVENT, RUM_XHR_RESOURCE_EVENT])
    })
  })

  describe('generateQueryFromFacetValues', () => {
    it('should generate query for single facet value', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include' as const,
        facetValues: {
          'resource.type': ['beacon'],
        },
      }
      expect(generateQueryFromFacetValues(facetValuesFilter)).toBe('resource.type:beacon')
    })

    it('should generate query for multiple facet values', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include' as const,
        facetValues: {
          'resource.type': ['beacon', 'xhr', 'image'],
        },
      }
      expect(generateQueryFromFacetValues(facetValuesFilter)).toBe(
        'resource.type:beacon resource.type:xhr resource.type:image'
      )
    })

    it('should generate query with exclude prefix', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'exclude' as const,
        facetValues: {
          'resource.type': ['beacon'],
        },
      }
      expect(generateQueryFromFacetValues(facetValuesFilter)).toBe('-resource.type:beacon')
    })

    it('should handle empty facet values', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include' as const,
        facetValues: {},
      }
      expect(generateQueryFromFacetValues(facetValuesFilter)).toBe('')
    })
  })
}
