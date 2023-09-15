import { Box, Checkbox } from '@mantine/core'
import React from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import { FacetList } from './facetList'

export function EventsTabSide({
  facetRegistry,
  filters,
  onFiltered,
}: {
  facetRegistry?: FacetRegistry
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
}) {
  return (
    <Box ml="md">
      <Checkbox
        label={'Show only the latest View\xa0event'}
        checked={!filters.outdatedVersions}
        onChange={(e) => onFiltered({ ...filters, outdatedVersions: !e.target.checked })}
        mb="sm"
      />

      {facetRegistry && (
        <FacetList
          facetRegistry={facetRegistry}
          excludedFacetValues={filters.excludedFacetValues}
          onExcludedFacetValuesChange={(newExcludedFacetValues) =>
            onFiltered({ ...filters, excludedFacetValues: newExcludedFacetValues })
          }
        />
      )}
    </Box>
  )
}
