import React from 'react'
import {Center, Text} from '@mantine/core'
import type {EventFilters, FacetRegistry} from '../../../hooks/useEvents'
import type {SdkEvent} from '../../../sdkEvent'
import {EventsTabTop} from './eventsTabTop'
import {EventsList} from './eventsList'
import type {EventListColumn} from './columnUtils'

interface EventsTabProps {
  events: SdkEvent[]
  facetRegistry: FacetRegistry | undefined
  filters: EventFilters
  onFiltersChange: (filters: EventFilters) => void
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
  clear: () => void
}

export function EventsTab({
  events,
  facetRegistry,
  filters,
  onFiltersChange,
  columns,
  onColumnsChange,
  clear,
}: EventsTabProps) {
  return (
      <div>
        <EventsTabTop filters={filters} onFiltersChange={onFiltersChange} clear={clear} />
        {events.length === 0 || !facetRegistry ? (
            <Center>
              <Text size="xl" c="dimmed" fw="bold">
                No events
              </Text>
            </Center>
        ) : (
            <EventsList
                events={events}
                filters={filters}
                facetRegistry={facetRegistry}
                columns={columns}
                onColumnsChange={onColumnsChange}
            />
        )}
      </div>
  )
}
