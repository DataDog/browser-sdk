import { Box, Card, Checkbox, Collapse, Flex, Text } from '@mantine/core'
import React from 'react'
import type { ExcludedFacetValues, FacetRegistry } from '../../../hooks/useEvents'
import type { Facet } from '../../../facets.constants'
import { FACET_ROOT, FacetValue } from '../../../facets.constants'
import * as classes from './facetList.module.css'

export function FacetList({
  facetRegistry,
  excludedFacetValues,
  onExcludedFacetValuesChange,
}: {
  facetRegistry: FacetRegistry
  excludedFacetValues: ExcludedFacetValues
  onExcludedFacetValuesChange: (newExcludedFacetValues: ExcludedFacetValues) => void
}) {
  return (
    <FacetField
      facet={FACET_ROOT}
      depth={0}
      facetRegistry={facetRegistry}
      excludedFacetValues={excludedFacetValues}
      onExcludedFacetValuesChange={onExcludedFacetValuesChange}
    />
  )
}

function FacetField({
  facet,
  depth,
  facetRegistry,
  excludedFacetValues,
  onExcludedFacetValuesChange,
}: {
  facet: Facet
  depth: number
  facetRegistry: FacetRegistry
  excludedFacetValues: ExcludedFacetValues
  onExcludedFacetValuesChange: (newExcludedFacetValues: ExcludedFacetValues) => void
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
          excludedFacetValues={excludedFacetValues}
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
  excludedFacetValues,
  onExcludedFacetValuesChange,
}: {
  facet: Facet
  facetValue: FacetValue
  facetValueCount: number
  depth: number
  facetRegistry: FacetRegistry
  excludedFacetValues: ExcludedFacetValues
  onExcludedFacetValuesChange: (newExcludedFacetValues: ExcludedFacetValues) => void
}) {
  const isTopLevel = depth === 0
  const isSelected = !excludedFacetValues[facet.path] || !excludedFacetValues[facet.path].includes(facetValue)
  const value = (
    <Flex justify="space-between" mt={isTopLevel ? 'xs' : SPACE_BETWEEN_CHECKBOX}>
      <Checkbox
        label={facet.values?.[facetValue]?.label ?? facetValue}
        checked={isSelected}
        onChange={() => {
          onExcludedFacetValuesChange(toggleExcludedFacetValue(facet, excludedFacetValues, facetValue))
        }}
      />
      <Text>{facetValueCount}</Text>
    </Flex>
  )

  const childFacets = facet.values?.[facetValue]?.facets
  const children = childFacets && (
    <Collapse in={isSelected}>
      <Box className={classes.facetChildren} data-top-level={isTopLevel ? true : undefined}>
        {childFacets.map((facet) => (
          <FacetField
            key={facet.path}
            facet={facet}
            facetRegistry={facetRegistry}
            depth={depth + 1}
            excludedFacetValues={excludedFacetValues}
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

function toggleExcludedFacetValue(
  facet: Facet,
  excludedFacetValues: ExcludedFacetValues,
  value: FacetValue
): ExcludedFacetValues {
  const currentExcludedValues = excludedFacetValues[facet.path]

  const newExcludedFacetValues = { ...excludedFacetValues }

  if (!currentExcludedValues) {
    // Add exclusion. Nothing was excluded yet, create a new list
    newExcludedFacetValues[facet.path] = [value]
  } else if (!currentExcludedValues.includes(value)) {
    // Add exclusion. Some other values are already excluded, add it to the list
    newExcludedFacetValues[facet.path] = currentExcludedValues.concat(value)
  } else if (currentExcludedValues.length === 1) {
    // Remove exclusion. If it's the only value, delete the list altogether.
    delete newExcludedFacetValues[facet.path]
  } else {
    // Remove exclusion. Filter out the the value from the existing list.
    newExcludedFacetValues[facet.path] = currentExcludedValues.filter((other) => other !== value)
  }

  return newExcludedFacetValues
}
