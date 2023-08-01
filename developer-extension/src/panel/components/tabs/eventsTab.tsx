import { Badge, Button, Checkbox, Chip, Group, Table, TextInput } from '@mantine/core'
import React from 'react'
import { safeTruncate } from '../../../../../packages/core/src/tools/utils/stringUtils'
import type { EventFilters } from '../../hooks/useEvents'
import { flushEvents } from '../../flushEvents'
import { Json } from '../json'
import { TabBase } from '../tabBase'
import { isRumEvent, isRumViewEvent, isTelemetryEvent, type SdkEvent } from '../../sdkEvent'

const RUM_EVENT_TYPE_COLOR = {
  action: 'violet',
  error: 'red',
  long_task: 'yellow',
  view: 'blue',
  resource: 'cyan',
  telemetry: 'teal',
}

const LOG_STATUS_COLOR = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
  debug: 'cyan',
}

interface EventTabProps {
  events: SdkEvent[]
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
  clear: () => void
}

export function EventTab({ events, filters, onFiltered, clear }: EventTabProps) {
  return (
    <TabBase
      top={
        <Group className="dd-privacy-allow">
          <Chip.Group
            multiple
            value={filters.sdk}
            onChange={(sdk) => onFiltered({ ...filters, sdk: sdk as Array<'rum' | 'logs'> })}
          >
            <Chip value="rum">RUM</Chip>
            <Chip value="logs">Logs</Chip>
            <Chip value="telemetry">Telemetry</Chip>
          </Chip.Group>
          <Checkbox
            label="Show only the latest View event"
            checked={!filters.outdatedVersions}
            onChange={(e) => onFiltered({ ...filters, outdatedVersions: !e.target.checked })}
          />
          <TextInput
            placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
            value={filters.query}
            style={{ flexGrow: 1 }}
            onChange={(event) => onFiltered({ ...filters, query: event.currentTarget.value })}
            className="dd-privacy-mask"
          />

          <Button color="violet" variant="light" onClick={flushEvents}>
            Flush
          </Button>
          <Button color="red" variant="light" onClick={clear}>
            Clear
          </Button>
        </Group>
      }
    >
      <Table striped verticalSpacing="xs" fontSize="xs">
        <tbody>
          {events.map((event) => (
            <tr key={getEventRenderingKey(event, !filters.outdatedVersions)}>
              <td width="20">{new Date(event.date).toLocaleTimeString()}</td>
              <td width="20">
                {isRumEvent(event) || isTelemetryEvent(event) ? (
                  <Badge variant="outline" color={RUM_EVENT_TYPE_COLOR[event.type]}>
                    {event.type}
                  </Badge>
                ) : (
                  <Badge variant="dot" color={LOG_STATUS_COLOR[event.status]}>
                    {event.origin as string} {event.status as string}
                  </Badge>
                )}
              </td>
              <td>
                <Json src={event} collapsed={true} name={getRumEventDescription(event)} />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TabBase>
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

function getRumEventDescription(event: SdkEvent): string | undefined {
  if (isRumEvent(event)) {
    switch (event.type) {
      case 'view':
        return `${event.view.loading_type || ''} ${getViewPage(event.view)}`
      case 'action':
        return `${event.action.type} action ${event.action.target?.name || ''} on page ${getViewPage(event.view)} `
      case 'resource':
        return `${event.resource.type} ${event.resource.url}`
      case 'error':
        return `${event.error.source} error ${event.error.message}`
      case 'long_task':
        return `long task of ${(event.long_task.duration / 1000).toLocaleString()} ms`
    }
  } else if (isTelemetryEvent(event)) {
    switch (event.telemetry.type) {
      case 'log':
        return event.telemetry.message
      case 'configuration':
        return jsonOverview(event.telemetry.configuration)
      default:
        return ''
    }
  } else {
    return event.message
  }
}

function getViewPage(view: { name?: string; url: string }) {
  return `${view.name || new URL(view.url).pathname}`
}

function jsonOverview(jsonObject: object) {
  const replacer = (key: any, value: any): any => {
    if (key && typeof value === 'object') {
      return '{...}'
    }
    return value
  }
  const overview = JSON.stringify(jsonObject, replacer)
  const unquoted = overview.replace(/"([^"]+)":/g, '$1:')
  return safeTruncate(unquoted, 100, '...')
}
