import { Table } from '@mantine/core'
import React, { useRef } from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import type { SdkEvent } from '../../../sdkEvent'
import { isRumViewEvent } from '../../../sdkEvent'
import type { EventListColumn } from './columnUtils'
import { EventRow } from './eventRow'
import { ColumnDrag } from './columnDrag'
import * as classes from './eventsList.module.css'
import { EventsListHeader } from './eventsListHeader'
import {ActionMap} from "../../../hooks/useEvents/trackingEvents";

export function EventsList({
  events,
  setEvents,
  filters,
  facetRegistry,
  actionMap,
  columns,
  onColumnsChange,
}: {
  events: SdkEvent[]
  setEvents: (events: SdkEvent[]) => void
  filters: EventFilters
  facetRegistry: FacetRegistry
  actionMap: ActionMap
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
}) {
  const headerRowRef = useRef<HTMLTableRowElement>(null)

  return (
    <div className={classes.root}>
      <Table stickyHeader>
        <colgroup>
          {columns.map((_, index) => (
            <col
              key={index}
              data-growable={
                // Only the last column is allowed to grow
                index === columns.length - 1 || undefined
              }
            />
          ))}
        </colgroup>
        <EventsListHeader
          ref={headerRowRef}
          columns={columns}
          onColumnsChange={onColumnsChange}
          facetRegistry={facetRegistry}
        />

        <Table.Tbody>
          {events.map((event) => (
            <EventRow
              key={getEventRenderingKey(event, !filters.outdatedVersions)}
              event={event}
              events={events}
              setEvents={setEvents}
              columns={columns}
              onColumnsChange={onColumnsChange}
              facetRegistry={facetRegistry}
              actionMap={actionMap}
            />
          ))}
        </Table.Tbody>
      </Table>

      <ColumnDrag columns={columns} onColumnsChange={onColumnsChange} headerRowRef={headerRowRef} />
    </div>
  )
}

const eventRenderingKeys = new WeakMap<SdkEvent, number>()
let nextEventRenderingKey = 1

function getEventRenderingKey(event: SdkEvent, excludeOutdatedVersions: boolean): number | string {
  // If we are showing only the latest view updates, return the view.id as key so the component is
  // simply updated and not recreated when a new update comes up.
  if (isRumViewEvent(event) && excludeOutdatedVersions) {
    return event.view.id
  }

  // Else return an ever-increasing id identifying each event instance.
  let key = eventRenderingKeys.get(event)
  if (key === undefined) {
    key = nextEventRenderingKey
    nextEventRenderingKey += 1
    eventRenderingKeys.set(event, key)
  }
  return key
}
