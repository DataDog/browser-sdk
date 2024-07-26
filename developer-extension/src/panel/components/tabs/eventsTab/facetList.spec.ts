import type { RumActionEvent, RumResourceEvent } from '@datadog/browser-rum'
import { FacetRegistry } from '../../../hooks/useEvents'
import { FACET_ROOT } from '../../../facets.constants'

import { computeSelectionState } from './computeFacetState'

const rumResourceXHREvent = {
  type: 'resource',
  resource: {
    type: 'xhr',
    url: 'http://example.com',
  },
} as RumResourceEvent

const rumResourceBeaconEvent = {
  type: 'resource',
  resource: {
    type: 'beacon',
    url: 'http://example.com',
  },
} as RumResourceEvent

const rumCustomActionEvent = {
  type: 'action',
  action: {
    type: 'custom',
  },
} as RumActionEvent

// test that computeSelectionState returns the correct state
describe('computeSelectionState', () => {
  describe('include mode', () => {
    it('returns "selected" when the facet is in the filter', () => {
      const facetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = FACET_ROOT.values?.rum

      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      const facetValue = 'xhr'
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('selected')
    })

    it('returns "partial-selected" when some children are in the filter', () => {
      const facetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'type',
        label: 'Type',
        values: {
          action: {
            facets: [
              {
                path: 'resource.type',
                label: 'Resource Type',
              },
            ],
          },
        },
      }
      const facetValue = 'resource'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumResourceBeaconEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('partial-selected')
      expect(computeSelectionState(facetValuesFilter, facetRegistry, FACET_ROOT, 'rum')).toBe('partial-selected')

    })

    it('returns "unselected" when the facet or children are not in the filter', () => {
      const facetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'type',
        label: 'Type',
        values: {
          action: {
            facets: [
              {
                path: 'action.type',
                label: 'Action Type',
              },
            ],
          },
        },
      }

      const facetValue = 'action'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumCustomActionEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('unselected')
    })
  })

  describe('exclude mode', () => {
    it('returns "unselected" when the facet is in the filter', () => {
      const facetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = FACET_ROOT.values?.rum

      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      const facetValue = 'xhr'
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('unselected')
    })
    it('returns "partial-selected" when some children are in the filter', () => {
      const facetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = FACET_ROOT
      const facetValue = 'resource'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumResourceBeaconEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('partial-selected')
    })

    it('returns "selected" when the facet or children are not in the filter', () => {
      const facetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'type',
        label: 'Type',
        values: {
          action: {
            facets: [
              {
                path: 'action.type',
                label: 'Action Type',
              },
            ],
          },
        },
      }
      const facetValue = 'action'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumCustomActionEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue)).toBe('selected')
    })
  })
})