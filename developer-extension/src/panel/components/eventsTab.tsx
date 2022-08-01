import { Badge, Button, Chip, Group, Space, Table, TextInput } from '@mantine/core'
import React from 'react'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'
import type { EventFilters, StoredEvent } from '../hooks/useEvents'
import { Json } from './json'

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
    events && (
      <>
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
          <Button color="red" variant="light" onClick={clear}>
            Clear
          </Button>
        </Group>
        <Space h="sm" />
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
                      {event.status as string} log
                    </Badge>
                  )}
                </td>
                <td>
                  <Json src={event} collapsed={true} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    )
  )
}
function isRumEvent(event: StoredEvent): event is RumEvent & { id: string } {
  return !event.status
}
