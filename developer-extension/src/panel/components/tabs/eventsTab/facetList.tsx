import { Box, Button, Card, Checkbox, Collapse, Flex, Text } from '@mantine/core'
import React from 'react'
import type { FacetValuesFilter, EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import { generateQueryFromFacetValues, DEFAULT_FILTERS } from '../../../hooks/useEvents'
import type { Facet } from '../../../facets.constants'
import { FACET_ROOT, FacetValue } from '../../../facets.constants'
import * as classes from './facetList.module.css'
import { computeSelectionState } from './computeFacetState'

export function FacetList({
  facetRegistry,
  filters,
  onFiltersChange,
}: {
  facetRegistry: FacetRegistry
  filters: EventFilters
  onFiltersChange: (newFilters: EventFilters) => void
}) {
  return (
    <FacetField
      facet={FACET_ROOT}
      depth={0}
      facetRegistry={facetRegistry}
      facetValuesFilter={filters.facetValuesFilter}
      onFiltersChange={onFiltersChange}
      parentList={[]}
      currentFilters={filters}
    />
  )
}

function FacetField({
  facet,
  depth,
  facetRegistry,
  facetValuesFilter,
  parentList,
  onFiltersChange,
  currentFilters,
}: {
  facet: Facet
  depth: number
  facetRegistry: FacetRegistry
  facetValuesFilter: FacetValuesFilter
  parentList: string[]
  onFiltersChange: (newFilters: EventFilters) => void
  currentFilters: EventFilters
}) {
  const facetValueCounts = facetRegistry.getFacetValueCounts(facet.path)

  return (
    <Box>
      {facet.label && (
        <Text pt="xs" c="dimmed" fw="bold">
          {facet.label}
        </Text>
      )}

      {Array.from(facetValueCounts.entries(), ([facetValue, facetValueCount]) => (
        <FacetValue
          key={facetValue}
          facet={facet}
          facetValue={facetValue}
          facetValueCount={facetValueCount}
          depth={depth}
          facetRegistry={facetRegistry}
          facetValuesFilter={facetValuesFilter}
          parentList={parentList.includes(facetValue) ? parentList : [...parentList, facetValue]}
          onFiltersChange={onFiltersChange}
          currentFilters={currentFilters}
        />
      ))}
    </Box>
  )
}

const SPACE_BETWEEN_CHECKBOX = 4 // the smallest size defined by mantine ("xs") is 10px, which is a bit too much

function FacetValue({
  facet,
  facetValue,
  facetValueCount,
  depth,
  facetRegistry,
  facetValuesFilter,
  parentList,
  onFiltersChange,
  currentFilters,
}: {
  facet: Facet
  facetValue: FacetValue
  facetValueCount: number
  depth: number
  facetRegistry: FacetRegistry
  facetValuesFilter: FacetValuesFilter
  parentList: string[]
  onFiltersChange: (newFilters: EventFilters) => void
  currentFilters: EventFilters
}) {
  const isTopLevel = depth === 0
  const facetSelectState = computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, parentList)
  const isCollapsed =
    !facetValuesFilter.facetValues[facet.path] || !facetValuesFilter.facetValues[facet.path].includes(facetValue)
  const isFiltered =
    facetValuesFilter.facetValues[facet.path] && facetValuesFilter.facetValues[facet.path].includes(facetValue)
  const isOnly = facetValuesFilter.type === 'include' && facetSelectState === 'selected'
  const value = (
    <Flex justify="space-between" mt={isTopLevel ? 'xs' : SPACE_BETWEEN_CHECKBOX}>
      <Checkbox
        label={facet.values?.[facetValue]?.label ?? facetValue}
        checked={facetSelectState === 'selected'}
        indeterminate={facetSelectState === 'partial-selected'} // can only populate direct parents
        onChange={() => {
          const filterType = facetSelectState === 'selected' ? 'exclude' : 'include'
          const newFacetValuesFilter = toggleFacetValue(filterType, facet, facetValuesFilter, facetValue)
          onFiltersChange({
            ...DEFAULT_FILTERS,
            ...currentFilters,
            facetValuesFilter: newFacetValuesFilter,
            query: generateQueryFromFacetValues(newFacetValuesFilter),
          })
        }}
      />
      <Text>{facetValueCount}</Text>
      <Button
        variant={isOnly ? 'filled' : 'light'}
        size="compact-xs"
        w="40px"
        onClick={() => {
          const filterType = isOnly ? 'exclude' : 'include'
          const newFacetValuesFilter = toggleFacetValue(filterType, facet, facetValuesFilter, facetValue)
          onFiltersChange({
            ...DEFAULT_FILTERS,
            ...currentFilters,
            facetValuesFilter: newFacetValuesFilter,
            query: generateQueryFromFacetValues(newFacetValuesFilter),
          })
        }}
      >
        {isOnly ? 'all' : 'only'}
      </Button>
    </Flex>
  )

  const childFacets = facet.values?.[facetValue]?.facets
  const children = childFacets && (
    <Collapse in={isCollapsed || isOnly}>
      <Box className={classes.facetChildren} data-top-level={isTopLevel ? true : undefined}>
        {childFacets.map((facet) => (
          <FacetField
            key={facet.path}
            facet={facet}
            facetRegistry={facetRegistry}
            depth={depth + 1}
            facetValuesFilter={facetValuesFilter}
            parentList={parentList.includes(facetValue) ? parentList : [...parentList, facetValue]}
            onFiltersChange={onFiltersChange}
            currentFilters={currentFilters}
          />
        ))}
      </Box>
    </Collapse>
  )

  if (isTopLevel) {
    return (
      <Card shadow="sm" padding="sm" radius="md" withBorder mb="md">
        <Card.Section withBorder={isFiltered} inheritPadding pb="xs">
          {value}
        </Card.Section>
        <Card.Section inheritPadding>{children}</Card.Section>
      </Card>
    )
  }

  return (
    <>
      {value}
      {children}
    </>
  )
}

function toggleFacetValue(
  type: 'include' | 'exclude',
  facet: Facet,
  facetValuesFilter: FacetValuesFilter,
  value: FacetValue
): FacetValuesFilter {
  const currentValues = facetValuesFilter.facetValues[facet.path]
  const newFacetValues = { ...facetValuesFilter.facetValues }

  if (facetValuesFilter.type !== type) {
    // handle mode changes
    if (type === 'exclude') {
      // reset when change from include to exclude
      return {
        type,
        facetValues: {},
      }
    } else if (type === 'include' && currentValues) {
      // should maintain one and only filter when change from exclude to include
      return {
        type,
        facetValues: currentValues.includes(value) ? newFacetValues : { [facet.path]: [value] },
      }
    }
  }

  if (!currentValues) {
    // Add exclusion or inclusion. Nothing was excluded yet, create a new list
    newFacetValues[facet.path] = [value]
  } else if (!currentValues.includes(value)) {
    // Add exclusion or inclusion. Some other values are already added, add it to the list
    newFacetValues[facet.path] = currentValues.concat(value)
  } else if (currentValues.length === 1) {
    // Remove exclusion or inclusion. If it's the only value, delete the list altogether.
    delete newFacetValues[facet.path]
  } else {
    // Remove exclusion or inclusion. Filter out the the value from the existing list.
    newFacetValues[facet.path] = currentValues.filter((other) => other !== value)
  }

  return { type, facetValues: newFacetValues }
}
