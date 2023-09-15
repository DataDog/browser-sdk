import { Badge } from '@mantine/core'
import React from 'react'
import type { SdkEvent } from '../../../sdkEvent'
import { isTelemetryEvent, isRumEvent } from '../../../sdkEvent'
import { safeTruncate } from '../../../../../../packages/core/src/tools/utils/stringUtils'
import { Json } from '../../json'

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

export function EventRow({ event }: { event: SdkEvent }) {
  return (
    <tr>
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
  )
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
