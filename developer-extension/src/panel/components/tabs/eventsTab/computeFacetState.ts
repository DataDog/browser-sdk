import type { FacetRegistry, FacetValuesFilter } from '../../../hooks/useEvents'
import type { Facet, FacetValue } from '../../../facets.constants'
type SelectionState = 'selected' | 'unselected' | 'partial-selected'

export function computeSelectionState(
  facetValuesFilter: FacetValuesFilter,
  facetRegistry: FacetRegistry,
  facet: Facet,
  facetValue: FacetValue,
  parentList: string[]
): SelectionState {
  const childrenFacets = getAllChildren(facet, facetValue)
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
    if (children && children.every((child: FacetValue) => filteredFacetValues.includes(child))) {
      return 'selected'
    }
    // if any of the children of the facet is in the filter, then it should be partial-selected
    if (children && children.some((child: FacetValue) => filteredFacetValues.includes(child))) {
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
    if (children && children.every((child: FacetValue) => filteredFacetValues.includes(child))) {
      return 'unselected'
    }
    // if any of the children of the facet is in the filter, then it should be partial-selected
    if (children && children.some((child: FacetValue) => filteredFacetValues.includes(child))) {
      return 'partial-selected'
    }
    return 'selected'
  }

  return 'unselected'
}

export const getAllChildren = (facet: Facet, facetValue: FacetValue): Facet[] => {
  const children =
    facet.values && Object.keys(facet.values).includes(facetValue)
      ? Object.values(facet.values).flatMap((value) => {
          if (value?.facets) {
            for (const childFacet of value.facets) {
              if (childFacet.path.includes(facetValue)) {
                return [childFacet]
              }
            }
          }
          return []
        })
      : []
  return children.concat(children.flatMap((f: Facet) => getAllChildren(f, facetValue)))
}
