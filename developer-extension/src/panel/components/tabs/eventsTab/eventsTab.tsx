import React from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import { TabBase } from '../../tabBase'
import type { SdkEvent } from '../../../sdkEvent'
import { EventsTabTop } from './eventsTabTop'
import { EventsList } from './eventsList'
import { EventsTabSide } from './eventsTabSide'

interface EventsTabProps {
  events: SdkEvent[]
  facetRegistry: FacetRegistry | undefined
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
  clear: () => void
}

export function EventsTab({ events, facetRegistry, filters, onFiltered, clear }: EventsTabProps) {
  return (
    <TabBase
      top={<EventsTabTop filters={filters} onFiltered={onFiltered} clear={clear} />}
      leftSide={<EventsTabSide filters={filters} onFiltered={onFiltered} facetRegistry={facetRegistry} />}
    >
      <EventsList events={events} filters={filters} />
    </TabBase>
  )
}
