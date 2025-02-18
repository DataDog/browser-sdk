import type { RumEvent } from '../../../../../packages/rum-core/src/rumEvent.types'
import type { LogsEvent } from '../../../../../packages/logs/src/logsEvent.types'
import { isSafari } from '../../../../../packages/core/src/tools/utils/browserDetection'
import { parseQuery, matchWithWildcard, filterFacets } from './eventFilters'
import type { FacetValuesFilter } from './eventFilters'
import { FacetRegistry } from './facetRegistry'
const RUM_ERROR_EVENT = { type: 'error' } as RumEvent
const RUM_ACTION_EVENT = { type: 'action' } as RumEvent
const LOGS_EVENT = { status: 'info', origin: 'logger' } as LogsEvent
const RUM_XHR_RESOURCE_EVENT = { type: 'resource', resource: { type: 'xhr' } } as RumEvent

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
      expect(parseQuery('foo:bar')).toEqual([['foo', 'bar']])
    })
    it('return intermediary fields', () => {
      expect(parseQuery('foo.bar:baz')).toEqual([['foo.bar', 'baz']])
    })
    it('return multiple fields', () => {
      expect(parseQuery('foo:bar baz:qux')).toEqual([
        ['foo', 'bar'],
        ['baz', 'qux'],
      ])
    })
    it('parse escaped whitespace with backslashes in search terms', () => {
      expect(parseQuery('foo:bar\\ baz')).toEqual([['foo', 'bar\\ baz']])
    })
    it('parse escaped whitespace with backslashes in keys', () => {
      expect(parseQuery('foo\\ bar:baz')).toEqual([['foo\\ bar', 'baz']])
    })
    it('return multiple fields with escaped whitespace', () => {
      expect(parseQuery('foo\\ bar:baz\\ qux')).toEqual([['foo\\ bar', 'baz\\ qux']])
      expect(parseQuery('foo:bar\\ baz qux:quux\\ corge')).toEqual([
        ['foo', 'bar\\ baz'],
        ['qux', 'quux\\ corge'],
      ])
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
}
