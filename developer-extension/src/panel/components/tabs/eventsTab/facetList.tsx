import { Box, Card, Checkbox, Collapse, Flex, Text } from '@mantine/core'
import React from 'react'
import type { ExcludedFacetValues, FacetRegistry } from '../../../hooks/useEvents'
import type { Facet } from '../../../facets.constants'
import { FACETS, FacetValue } from '../../../facets.constants'
import { BORDER_RADIUS, tabsListBorder } from '../../../uiUtils'

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
      facet={FACETS[0]}
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
  const facetValueCounts = facetRegistry.getFacetValueCounts(facet.id)

  return (
    <Box>
      {facet.label && (
        <Text pt="xs" color="dimmed" weight="bold">
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
  const isSelected = !excludedFacetValues[facet.id] || !excludedFacetValues[facet.id].includes(facetValue)
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

  const childFacets = FACETS.filter((otherFacet) => otherFacet.parent === `${facet.id}:${facetValue}`)
  const children = childFacets.length > 0 && (
    <Collapse in={isSelected}>
      <Box
        ml={isTopLevel ? undefined : 9}
        pl={isTopLevel ? undefined : 9}
        pb="xs"
        sx={(theme) => ({
          borderLeft: isTopLevel ? undefined : tabsListBorder(theme),
          borderBottomLeftRadius: BORDER_RADIUS,
        })}
      >
        {childFacets.map((facet) => (
          <FacetField
            key={facet.id}
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
      <Card shadow="sm" padding="sm" radius={BORDER_RADIUS} withBorder mb="md">
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
  const currentExcludedValues = excludedFacetValues[facet.id]

  const newExcludedFacetValues = { ...excludedFacetValues }

  if (!currentExcludedValues) {
    // Add exclusion. Nothing was excluded yet, create a new list
    newExcludedFacetValues[facet.id] = [value]
  } else if (!currentExcludedValues.includes(value)) {
    // Add exclusion. Some other values are already excluded, add it to the list
    newExcludedFacetValues[facet.id] = currentExcludedValues.concat(value)
  } else if (currentExcludedValues.length === 1) {
    // Remove exclusion. If it's the only value, delete the list altogether.
    delete newExcludedFacetValues[facet.id]
  } else {
    // Remove exclusion. Filter out the the value from the existing list.
    newExcludedFacetValues[facet.id] = currentExcludedValues.filter((other) => other !== value)
  }

  return newExcludedFacetValues
}
