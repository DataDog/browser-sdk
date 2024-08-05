import { Box, Button, Card, Checkbox, Collapse, Flex, Text } from '@mantine/core'
import React from 'react'
import type { FacetValuesFilter, FacetRegistry } from '../../../hooks/useEvents'
import type { Facet } from '../../../facets.constants'
import { FACET_ROOT, FacetValue } from '../../../facets.constants'
import * as classes from './facetList.module.css'
import { computeSelectionState } from './computeFacetState'

export function FacetList({
  facetRegistry,
  facetValuesFilter,
  onExcludedFacetValuesChange,
}: {
  facetRegistry: FacetRegistry
  facetValuesFilter: FacetValuesFilter
  onExcludedFacetValuesChange: (newExcludedFacetValues: FacetValuesFilter) => void
}) {
  return (
    <FacetField
      facet={FACET_ROOT}
      depth={0}
      facetRegistry={facetRegistry}
      facetValuesFilter={facetValuesFilter}
      onExcludedFacetValuesChange={onExcludedFacetValuesChange}
      parentList={[]}
    />
  )
}

function FacetField({
  facet,
  depth,
  facetRegistry,
  facetValuesFilter,
  parentList,
  onExcludedFacetValuesChange,
}: {
  facet: Facet
  depth: number
  facetRegistry: FacetRegistry
  facetValuesFilter: FacetValuesFilter
    parentList: string[]
  onExcludedFacetValuesChange: (newExcludedFacetValues: FacetValuesFilter) => void
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
          onExcludedFacetValuesChange={onExcludedFacetValuesChange}
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
  onExcludedFacetValuesChange,
}: {
  facet: Facet
  facetValue: FacetValue
  facetValueCount: number
  depth: number
  facetRegistry: FacetRegistry
  facetValuesFilter: FacetValuesFilter
    parentList: string[]
  onExcludedFacetValuesChange: (newExcludedFacetValues: FacetValuesFilter) => void
}) {
  const isTopLevel = depth === 0
  const facetSelectState = computeSelectionState(facetValuesFilter, facetRegistry, facet, facetValue, parentList)
  const isCollapsed =
    !facetValuesFilter.facetValues[facet.path] || !facetValuesFilter.facetValues[facet.path].includes(facetValue)
  const isSelected =
    facetValuesFilter.facetValues[facet.path] && facetValuesFilter.facetValues[facet.path].includes(facetValue)
  const isOnly = facetValuesFilter.type === 'include' && Object.keys(facetValuesFilter.facetValues).length === 1
  const value = (
    <Flex justify="space-between" mt={isTopLevel ? 'xs' : SPACE_BETWEEN_CHECKBOX}>
      <Checkbox
        label={facet.values?.[facetValue]?.label ?? facetValue}
        checked={facetSelectState === 'selected'}
        indeterminate={facetSelectState === 'partial-selected'}
        onChange={() => {
          if (isOnly && !facetValuesFilter.facetValues[facet.path]?.includes(facetValue)) {
            facetValuesFilter.facetValues = {
              [facet.path]: [facetValue],
            }
            onExcludedFacetValuesChange(facetValuesFilter)
          } else {
            onExcludedFacetValuesChange(toggleFacetValue('exclude', facet, facetValuesFilter, facetValue))
          }
        }}
      />
      <Text>{facetValueCount}</Text>
      <Button
        variant={isOnly && isSelected ? 'filled' : 'light'}
        size="compact-xs"
        w="40px"
        disabled={isOnly && !isSelected}
        onClick={() => {
          const filterType = isOnly ? 'exclude' : 'include'
          onExcludedFacetValuesChange(toggleFacetValue(filterType, facet, facetValuesFilter, facetValue))
        }}
      >
        {isOnly && isSelected ? 'all' : 'only'}
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
            onExcludedFacetValuesChange={onExcludedFacetValuesChange}
          />
        ))}
      </Box>
    </Collapse>
  )

  if (isTopLevel) {
    return (
      <Card shadow="sm" padding="sm" radius="md" withBorder mb="md">
        <Card.Section withBorder={isSelected} inheritPadding pb="xs">
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
  let currentValues = facetValuesFilter.facetValues[facet.path]
  if (type !== facetValuesFilter.type) {
    if (type === 'include') {
      currentValues = []
    }
  }
  const newFacetValues = { ...facetValuesFilter.facetValues }

  if (!currentValues) {
    // Add exclusion. Nothing was excluded yet, create a new list
    newFacetValues[facet.path] = [value]
  } else if (!currentValues.includes(value)) {
    // Add exclusion. Some other values are already excluded, add it to the list
    newFacetValues[facet.path] = currentValues.concat(value)
  } else if (currentValues.length === 1) {
    // Remove exclusion. If it's the only value, delete the list altogether.
    delete newFacetValues[facet.path]
  } else {
    // Remove exclusion. Filter out the the value from the existing list.
    newFacetValues[facet.path] = currentValues.filter((other) => other !== value)
  }

  return { type, facetValues: newFacetValues }
}
