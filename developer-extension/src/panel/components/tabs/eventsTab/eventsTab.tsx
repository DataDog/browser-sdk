import React from 'react'
import type { EventFilters } from '../../../hooks/useEvents'
import { TabBase } from '../../tabBase'
import type { SdkEvent } from '../../../sdkEvent'
import { EventsTabTop } from './eventsTabTop'
import { EventsList } from './eventsList'

interface EventsTabProps {
  events: SdkEvent[]
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
  clear: () => void
}

export function EventsTab({ events, filters, onFiltered, clear }: EventsTabProps) {
  return (
    <TabBase top={<EventsTabTop filters={filters} onFiltered={onFiltered} clear={clear} />}>
      <EventsList events={events} filters={filters} />
    </TabBase>
  )
}
