import type { FacetRegistry, FacetValuesFilter } from '../../../hooks/useEvents'
import type { Facet, FacetValue } from '../../../facets.constants'
type SelectionState = 'selected' | 'unselected' | 'partial-selected'

export function computeSelectionState(
  facetValuesFilter: FacetValuesFilter,
  facetRegistry: FacetRegistry,
  facet: Facet,
  facetValue: FacetValue
): SelectionState {
  const childrenFacets = getAllChildren(facet, facetValue)
  // we cannot know how many children in total there are, so we need to have facetRegistry
  const children = childrenFacets.flatMap((child) => facetRegistry.getFacetChildrenValues(child.path))
  const filteredFacetValues = childrenFacets.flatMap((child) => facetValuesFilter.facetValues[child.path] ?? [])
  filteredFacetValues.push(...(facetValuesFilter.facetValues[facet.path] ?? []))
  const ifFilterEmpty = Object.keys(facetValuesFilter.facetValues).length === 0
  if (facetValuesFilter.type === 'include') {
    if (ifFilterEmpty) {
      return 'unselected'
    }
    // if facet.value is in facetValueFilter, then it should be selected
    if (filteredFacetValues.includes(facetValue)) {
      return 'selected'
    }
    // if all children are in the filter, then it should be selected'
    if (children.length > 0 && children.every((child) => filteredFacetValues.includes(child))) {
      return 'selected'
    }
    // if any of the children of the facet is in the filter, then it should be partial-selected
    if (children.length > 0 && children.some((child) => filteredFacetValues.includes(child))) {
      return 'partial-selected'
    }
  } else if (facetValuesFilter.type === 'exclude') {
    if (ifFilterEmpty) {
      return 'selected'
    }
    // if facet.value is in facetValueFilter, then it should be unselected
    if (filteredFacetValues.includes(facetValue)) {
      return 'unselected'
    }
    // if all children are in the filter, then it should be unselected
    if (children.length > 0 && children.every((child) => filteredFacetValues.includes(child))) {
      return 'unselected'
    }
    // if any of the children of the facet is in the filter, then it should be partial-selected
    if (children.length > 0 && children.some((child) => filteredFacetValues.includes(child))) {
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
