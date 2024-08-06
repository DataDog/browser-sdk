import type { RumActionEvent, RumResourceEvent } from '@datadog/browser-rum'
import { FacetRegistry } from '../../../hooks/useEvents'
import type { FacetValuesFilter } from '../../../hooks/useEvents'
import { FACET_ROOT } from '../../../facets.constants'
import type { Facet } from '../../../facets.constants'
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
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'resource.type',
        label: 'Resource Type',
      }

      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      const facetValue = 'xhr'
      expect(
        computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'resource', 'xhr'])
      ).toBe('selected')
    })

    it('returns "partial-selected" when some children are in the filter', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = FACET_ROOT.values!.rum?.facets![0] as Facet
      const facetValue = 'resource'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumResourceBeaconEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'resource'])).toBe(
        'partial-selected'
      )
    })

    it('returns "unselected" when the facet or children are not in the filter', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'include',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'action.type',
        label: 'Action Type',
      }

      const facetValue = 'action'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumCustomActionEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'action'])).toBe(
        'unselected'
      )
    })
  })

  describe('exclude mode', () => {
    it('returns "unselected" when the facet is in the filter', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'resource.type',
        label: 'Resource Type',
      }
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      const facetValue = 'xhr'
      expect(
        computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'resource', 'xhr'])
      ).toBe('unselected')
    })
    it('returns "partial-selected" when some children are in the filter', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = FACET_ROOT.values!.rum?.facets![0] as Facet

      const facetValue = 'resource'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumResourceBeaconEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'resource'])).toBe(
        'partial-selected'
      )
    })

    it('returns "selected" when the facet or children are not in the filter', () => {
      const facetValuesFilter: FacetValuesFilter = {
        type: 'exclude',
        facetValues: {
          'resource.type': ['xhr'],
        },
      }
      const facet = {
        path: 'action.type',
        label: 'Action Type',
      }

      const facetValue = 'action'
      const facetRegistry = new FacetRegistry()
      facetRegistry.addEvent(rumResourceXHREvent)
      facetRegistry.addEvent(rumCustomActionEvent)
      expect(computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, ['rum', 'action'])).toBe(
        'selected'
      )
    })
  })
})
