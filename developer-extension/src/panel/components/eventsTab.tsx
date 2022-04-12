import { Badge, Group, SegmentedControl, Space, Table, TextInput } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React from 'react'
import ReactJson from 'react-json-view'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'
import { safeTruncate } from '../../../../packages/core/src/tools/utils'
import type { EventFilters, StoredEvent } from '../hooks/useEvents'

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
}

export function EventTab({ events, filters, onFiltered }: EventTabProps) {
  const colorScheme = useColorScheme()
  return (
    events && (
      <>
        <Group>
          <SegmentedControl
            value={filters.sdk}
            onChange={(sdk: 'rum' | 'logs') => onFiltered({ ...filters, sdk })}
            data={[
              { label: 'RUM', value: 'rum' },
              { label: 'Logs', value: 'logs' },
            ]}
          />
          <TextInput
            placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
            value={filters.query}
            style={{ flexGrow: 1 }}
            onChange={(event) => onFiltered({ ...filters, query: event.currentTarget.value })}
          />
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
                  <ReactJson
                    src={event}
                    collapsed={true}
                    theme={colorScheme === 'dark' ? 'monokai' : 'bright:inverted'}
                    name={jsonOverview(event)}
                    displayDataTypes={false}
                  />
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

const replacer = (key: any, value: any): any => {
  if (key && typeof value === 'object') return '{...}'
  return value
}

function jsonOverview(jsonObject: object) {
  const overview = JSON.stringify(jsonObject, replacer)
  const unquoted = overview.replace(/"([^"]+)":/g, '$1:')
  return safeTruncate(unquoted, 100, '...')
}
