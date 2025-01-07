import type { FacetRegistry, FacetValuesFilter } from '../../../hooks/useEvents'
import type { Facet, FacetValue } from '../../../facets.constants'
type SelectionState = 'selected' | 'unselected' | 'partial-selected'

function isAllChildrenFiltered(children: string[], filteredFacetValues: string[]) {
  return children.every((child: FacetValue) => filteredFacetValues.includes(child))
}

function isAnyChildrenFiltered(children: string[], filteredFacetValues: string[]) {
  return children.some((child: FacetValue) => filteredFacetValues.includes(child))
}

// limitation: only populate direct parents
export function computeSelectionState(
  facetValuesFilter: FacetValuesFilter,
  facetRegistry: FacetRegistry,
  facet: Facet,
  facetValue: FacetValue,
  parentList: string[]
): SelectionState {
  const childrenFacets = facet.values?.[facetValue]?.facets

  // we cannot know how many children in total there are, so we need to have facetRegistry
  const children =
    childrenFacets && childrenFacets.flatMap((child: Facet) => facetRegistry.getFacetChildrenValues(child.path))
  const filteredFacetValues = Object.values(facetValuesFilter.facetValues).flat()
  const isFiltering = !!Object.keys(facetValuesFilter.facetValues)

  if (facetValuesFilter.type === 'include') {
    if (!isFiltering) {
      return 'unselected'
    }

    for (const parent of parentList) {
      if (filteredFacetValues.includes(parent)) {
        return 'selected'
      }
    }

    // if all children are in the filter, then it should be selected'
    if (children && isAllChildrenFiltered(children, filteredFacetValues)) {
      return 'selected'
    }
    // if any of the direct children of the facet is in the filter, then it should be partial-selected
    if (children && isAnyChildrenFiltered(children, filteredFacetValues)) {
      return 'partial-selected'
    }
  } else if (facetValuesFilter.type === 'exclude') {
    if (!isFiltering) {
      return 'selected'
    }
    // if facet.value is in facetValueFilter, then it should be unselected
    if (filteredFacetValues.includes(facetValue)) {
      return 'unselected'
    }
    // if all children are in the filter, then it should be unselected
    if (children && isAllChildrenFiltered(children, filteredFacetValues)) {
      return 'unselected'
    }
    // if any of the children of the facet is in the filter, then it should be partial-selected
    if (children && isAnyChildrenFiltered(children, filteredFacetValues)) {
      return 'partial-selected'
    }
    return 'selected'
  }

  return 'unselected'
}
