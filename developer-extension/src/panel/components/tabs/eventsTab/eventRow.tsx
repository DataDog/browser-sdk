import { Badge, Box } from '@mantine/core'
import type { ReactNode } from 'react'
import React, { useRef, useState } from 'react'
import type { TelemetryEvent } from '../../../../../../packages/core/src/domain/telemetry'
import type { LogsEvent } from '../../../../../../packages/logs/src/logsEvent.types'
import type {
  RumActionEvent,
  RumErrorEvent,
  RumLongTaskEvent,
  RumResourceEvent,
  RumViewEvent,
} from '../../../../../../packages/rum-core/src/rumEvent.types'
import type { SdkEvent } from '../../../sdkEvent'
import { isTelemetryEvent, isLogEvent, isRumEvent } from '../../../sdkEvent'
import { formatDuration } from '../../../formatNumber'
import { Json } from '../../json'
import { LazyCollapse } from '../../lazyCollapse'

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

const RESOURCE_TYPE_LABELS: Record<string, string | undefined> = {
  xhr: 'XHR',
  fetch: 'Fetch',
  document: 'Document',
  beacon: 'Beacon',
  css: 'CSS',
  js: 'JS',
  image: 'Image',
  font: 'Font',
  media: 'Media',
  other: 'Other',
}

export function EventRow({ event }: { event: SdkEvent }) {
  const [isCollapsed, setIsCollapsed] = useState(true)
  const jsonRef = useRef<HTMLDivElement>(null)

  return (
    <tr
      onClick={(event) => {
        if (jsonRef.current?.contains(event.target as Node)) {
          // Ignore clicks on the collapsible area
          return
        }
        setIsCollapsed((previous) => !previous)
      }}
    >
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
        <EventDescription event={event} />
        <LazyCollapse in={!isCollapsed}>
          <Json ref={jsonRef} value={event} defaultCollapseLevel={0} />
        </LazyCollapse>
      </td>
    </tr>
  )
}

export const EventDescription = React.memo(({ event }: { event: SdkEvent }) => {
  if (isRumEvent(event)) {
    switch (event.type) {
      case 'view':
        return <ViewDescription event={event} />
      case 'long_task':
        return <LongTaskDescription event={event} />
      case 'error':
        return <ErrorDescription event={event} />
      case 'resource':
        return <ResourceDescription event={event} />
      case 'action':
        return <ActionDescription event={event} />
    }
  } else if (isLogEvent(event)) {
    return <LogDescription event={event} />
  } else {
    return <TelemetryDescription event={event} />
  }
})

function LogDescription({ event }: { event: LogsEvent }) {
  return <>{event.message}</>
}

function TelemetryDescription({ event }: { event: TelemetryEvent }) {
  if (event.telemetry.type === 'configuration') {
    return <Emphasis>Configuration</Emphasis>
  }
  return <>{event.telemetry.message}</>
}

function ViewDescription({ event }: { event: RumViewEvent }) {
  const isRouteChange = event.view.loading_type === 'route_change'

  return (
    <>
      {isRouteChange ? 'SPA Route Change' : 'Load Page'} <Emphasis>{getViewName(event.view)}</Emphasis>
    </>
  )
}

function ActionDescription({ event }: { event: RumActionEvent }) {
  const actionName = event.action.target?.name
  const frustrationTypes = event.action.frustration?.type

  if (event.action.type === 'custom') {
    return (
      <>
        Custom user action <Emphasis>{event.action.target?.name}</Emphasis>
      </>
    )
  }

  return (
    <>
      {frustrationTypes && frustrationTypes.length > 0 && '😡 '}
      <Emphasis>{event.action.type}</Emphasis>
      {actionName && (
        <>
          {' '}
          on <Emphasis>{actionName}</Emphasis>
        </>
      )}
    </>
  )
}
function LongTaskDescription({ event }: { event: RumLongTaskEvent }) {
  return (
    <>
      Long task of <Emphasis>{formatDuration(event.long_task.duration)}</Emphasis>
    </>
  )
}

function ErrorDescription({ event }: { event: RumErrorEvent }) {
  return (
    <>
      <Emphasis>{event.error.source}</Emphasis> error {event.error.type}: {event.error.message}
    </>
  )
}

function ResourceDescription({ event }: { event: RumResourceEvent }) {
  const resourceType = event.resource.type
  const isAsset = resourceType !== 'xhr' && resourceType !== 'fetch'

  if (isAsset) {
    return (
      <>
        Load <Emphasis>{RESOURCE_TYPE_LABELS[resourceType] || RESOURCE_TYPE_LABELS.other}</Emphasis> file{' '}
        <Emphasis>{event.resource.url}</Emphasis>
      </>
    )
  }

  return (
    <>
      {RESOURCE_TYPE_LABELS[resourceType]} request <Emphasis>{event.resource.url}</Emphasis>
    </>
  )
}

function Emphasis({ children }: { children: ReactNode }) {
  return (
    <Box component="span" sx={{ fontWeight: 'bold' }}>
      {children}
    </Box>
  )
}

function getViewName(view: { name?: string; url: string }) {
  return `${view.name || new URL(view.url).pathname}`
}
