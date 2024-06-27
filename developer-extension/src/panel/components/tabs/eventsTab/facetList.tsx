import { Box, Button, Card, Checkbox, Collapse, Flex, Text } from '@mantine/core'
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
  const [allFacetValues, setAllFacetValues] = React.useState<ExcludedFacetValues>({})

  return (
    <FacetField
      facet={FACET_ROOT}
      depth={0}
      facetRegistry={facetRegistry}
      excludedFacetValues={excludedFacetValues}
      onExcludedFacetValuesChange={onExcludedFacetValuesChange}
      addFacetValues={(facet: Facet, facetValue: FacetValue) => {
        // check if the facet value is already in allFacetValues
        if (!excludedFacetValues[facet.path] || !excludedFacetValues[facet.path].includes(facetValue)) {
          // if the facet path is in allFacetValues but not the value, add the facet value
          if (allFacetValues[facet.path] && !allFacetValues[facet.path].includes(facetValue)) {
            setAllFacetValues({ ...allFacetValues, [facet.path]: [...allFacetValues[facet.path], facetValue] })

            // if the facet path is not in allFacetValues, add it
          } else if (!allFacetValues[facet.path]) {
            setAllFacetValues({ ...allFacetValues, [facet.path]: [facetValue] })
          }
        }
      }}
      allFacetValues={allFacetValues}
      parentList={[]}
    />
  )
}

function FacetField({
  facet,
  depth,
  facetRegistry,
  excludedFacetValues,
  onExcludedFacetValuesChange,
  addFacetValues,
  allFacetValues,
  parentList,
}: {
  facet: Facet
  depth: number
  facetRegistry: FacetRegistry
  excludedFacetValues: ExcludedFacetValues
  onExcludedFacetValuesChange: (newExcludedFacetValues: ExcludedFacetValues) => void
  addFacetValues: (facet: Facet, facetValue: FacetValue) => void
  allFacetValues: ExcludedFacetValues
  parentList: string[]
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
          addFacetValues={addFacetValues}
          allFacetValues={allFacetValues}
          parentList={parentList.includes(facetValue) ? parentList : [...parentList, facetValue]}
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
  addFacetValues,
  allFacetValues,
  parentList,
}: {
  facet: Facet
  facetValue: FacetValue
  facetValueCount: number
  depth: number
  facetRegistry: FacetRegistry
  excludedFacetValues: ExcludedFacetValues
  onExcludedFacetValuesChange: (newExcludedFacetValues: ExcludedFacetValues) => void
  addFacetValues: (facet: Facet, facetValue: FacetValue) => void
  allFacetValues: ExcludedFacetValues
  parentList: string[]
}) {
  addFacetValues(facet, facetValue)

  const isTopLevel = depth === 0
  const isSelected = !excludedFacetValues[facet.path] || !excludedFacetValues[facet.path].includes(facetValue)
  const [isOnly, setIsOnly] = React.useState(false)
  const value = (
    <Flex justify="space-between" mt={isTopLevel ? 'xs' : SPACE_BETWEEN_CHECKBOX}>
      <Checkbox
        label={facet.values?.[facetValue]?.label ?? facetValue}
        checked={isSelected}
        onChange={() => {
          onExcludedFacetValuesChange(toggleExcludedFacetValue(facet, excludedFacetValues, facetValue))
        }}
      />
      <Flex justify="space-between" gap="md">
        <Text>{facetValueCount}</Text>

        {excludedFacetValues[facet.path]?.includes(facetValue) ? null : (
          // show only button when the facet value is not excluded
          <Button
            variant={isOnly ? 'filled' : 'light'}
            size="compact-xs"
            w="40px"
            onClick={() => {
              onExcludedFacetValuesChange(
                toggleOnlyAllFacetValue(facet, isOnly, allFacetValues, parentList, facetValue)
              )
              setIsOnly(!isOnly)
            }}
          >
            {isOnly ? 'all' : 'only'}
          </Button>
        )}
      </Flex>
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
            addFacetValues={addFacetValues}
            allFacetValues={allFacetValues}
            parentList={parentList.includes(facetValue) ? parentList : [...parentList, facetValue]}
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

function toggleOnlyAllFacetValue(
  facet: Facet,
  isOnly: boolean,
  allFacetValues: ExcludedFacetValues,
  parentList: string[],
  value: FacetValue
): ExcludedFacetValues {
  if (isOnly) {
    // when on Only mode, include all
    return {}
  }

  const newExcludedFacetValues = { ...allFacetValues }

  // search for the facetValue and delete it
  newExcludedFacetValues[facet.path] = newExcludedFacetValues[facet.path].filter((v) => v !== value)

  // deep iterate all values and remove all parents of the facetValue
  const keys = Object.keys(newExcludedFacetValues)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const values = newExcludedFacetValues[key]
    for (let j = 0; j < values.length; j++) {
      const v = values[j]
      if (parentList.includes(v)) {
        newExcludedFacetValues[key] = newExcludedFacetValues[key].filter((v) => !parentList.includes(v))
      }
    }
  }

  // deep iterate all values and remove children of the facetValue
  const children = getAllChildren(facet)
  children?.forEach((child) => {
    newExcludedFacetValues[child.path] = []
  })

  return newExcludedFacetValues
}

const getAllChildren = (facet: Facet): Facet[] => {
  const children = facet.values ? Object.values(facet.values).flatMap((value) => value?.facets ?? []) : []
  return children.concat(children.flatMap(getAllChildren))
}
