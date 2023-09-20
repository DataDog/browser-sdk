import React from 'react'
import { Center, Text } from '@mantine/core'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import { TabBase } from '../../tabBase'
import type { SdkEvent } from '../../../sdkEvent'
import { EventsTabTop } from './eventsTabTop'
import { EventsList } from './eventsList'
import { EventsTabSide } from './eventsTabSide'
import type { EventListColumn } from './columnUtils'

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
    <TabBase
      top={<EventsTabTop filters={filters} onFiltersChange={onFiltersChange} clear={clear} />}
      leftSide={<EventsTabSide filters={filters} onFiltersChange={onFiltersChange} facetRegistry={facetRegistry} />}
    >
      {events.length === 0 || !facetRegistry ? (
        <Center>
          <Text size="xl" color="dimmed" weight="bold">
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
    </TabBase>
  )
}
