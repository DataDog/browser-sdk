import { Badge, Button, Table } from '@mantine/core'
import React from 'react'
import ReactJson from 'react-json-view'
import { useStore } from '../useStore'
import { sendAction } from '../actions'
import type { RumEvent } from '../../../../packages/rum-core/src/rumEvent.types'
import { safeTruncate } from '../../../../packages/core/src/tools/utils'
import type { StoredEvent } from '../../common/types'

const RUM_EVENT_TYPE_COLOR = {
  action: 'violet',
  error: 'red',
  long_task: 'yellow',
  view: 'blue',
  resource: 'cyan',
}

const LOG_STATUS_COLOR = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
  debug: 'cyan',
}

export function EventTab() {
  const [{ local }] = useStore()

  const currentTabStore = local[chrome.devtools.inspectedWindow.tabId]
  const events = currentTabStore ? currentTabStore.events : []

  return (
    events && (
      <>
        <Button onClick={() => sendAction('flushEvents', undefined)}>Flush buffered events</Button>
        <Table striped>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Event</th>
            </tr>
          </thead>
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
                    theme="monokai"
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
  return event.type !== undefined
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
