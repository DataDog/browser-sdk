import { Badge, Button, Chip, Group, Table, TextInput } from '@mantine/core'
import React from 'react'
import type { TelemetryEvent } from '../../../../../packages/core/src/domain/telemetry'
import type { RumEvent } from '../../../../../packages/rum-core/src/rumEvent.types'
import type { EventFilters, StoredEvent } from '../../hooks/useEvents'
import { safeTruncate } from '../../../../../packages/core/src/tools/utils'
import { flushEvents } from '../../flushEvents'
import { Json } from '../json'
import { TabBase } from '../tabBase'

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
  events: StoredEvent[]
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
  clear: () => void
}

export function EventTab({ events, filters, onFiltered, clear }: EventTabProps) {
  return (
    <TabBase
      top={
        <Group>
          <Chip.Group
            multiple
            value={filters.sdk}
            onChange={(sdk) => onFiltered({ ...filters, sdk: sdk as Array<'rum' | 'logs'> })}
          >
            <Chip value="rum">RUM</Chip>
            <Chip value="logs">Logs</Chip>
          </Chip.Group>
          <TextInput
            placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
            value={filters.query}
            style={{ flexGrow: 1 }}
            onChange={(event) => onFiltered({ ...filters, query: event.currentTarget.value })}
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
            <tr key={event.id}>
              <td width="20">{new Date(event.date).toLocaleTimeString()}</td>
              <td width="20">
                {isRumEvent(event) ? (
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

function isRumEvent(event: StoredEvent): event is (RumEvent | TelemetryEvent) & { id: string } {
  return !event.status
}

function getRumEventDescription(event: StoredEvent): string | undefined {
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
      case 'telemetry': {
        switch (event.telemetry.type) {
          case 'log':
            return event.telemetry.message
          case 'configuration':
            return jsonOverview(event.telemetry.configuration)
          default:
            return ''
        }
      }
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
