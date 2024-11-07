import React from 'react'
import { Center, Text } from '@mantine/core'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import {ActionMap} from "../../../hooks/useEvents/trackingEvents";
import { TabBase } from '../../tabBase'
import type { SdkEvent } from '../../../sdkEvent'
import { EventsTabTop } from './eventsTabTop'
import { EventsList } from './eventsList'
import { EventsTabSide } from './eventsTabSide'
import type { EventListColumn } from './columnUtils'

interface EventsTabProps {
  events: SdkEvent[]
  setEvents: (events: SdkEvent[]) => void
  facetRegistry: FacetRegistry | undefined
  actionMap: ActionMap | undefined
  filters: EventFilters
  onFiltersChange: (filters: EventFilters) => void
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
  clear: () => void
}

export function EventsTab({
  events,
  setEvents,
  facetRegistry,
  actionMap,
  filters,
  onFiltersChange,
  columns,
  onColumnsChange,
  clear,
}: EventsTabProps) {
  return (
      <div>
        <EventsTabTop filters={filters} onFiltersChange={onFiltersChange} clear={clear} />
        {events.length === 0 || !facetRegistry || !actionMap ? (
            <Center>
              <Text size="xl" c="dimmed" fw="bold">
                No events
              </Text>
            </Center>
        ) : (
            <EventsList
                events={events}
                setEvents={setEvents}
                filters={filters}
                facetRegistry={facetRegistry}
                actionMap={actionMap}
                columns={columns}
                onColumnsChange={onColumnsChange}
            />
        )}
      </div>
  )
}
