import { Table } from '@mantine/core'
import React from 'react'
import type { EventFilters } from '../../../hooks/useEvents'
import type { SdkEvent } from '../../../sdkEvent'
import { isRumViewEvent } from '../../../sdkEvent'
import { EventRow } from './eventRow'

export function EventsList({ events, filters }: { events: SdkEvent[]; filters: EventFilters }) {
  return (
    <Table striped verticalSpacing="xs">
      <tbody>
        {events.map((event) => (
          <EventRow key={getEventRenderingKey(event, !filters.outdatedVersions)} event={event} />
        ))}
      </tbody>
    </Table>
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
