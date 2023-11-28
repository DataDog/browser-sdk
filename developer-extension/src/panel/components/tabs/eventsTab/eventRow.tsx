import { Table, Badge, Menu } from '@mantine/core'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import React, { useRef, useState } from 'react'
import clsx from 'clsx'
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
import { formatDate, formatDuration } from '../../../formatNumber'
import { defaultFormatValue, Json } from '../../json'
import { LazyCollapse } from '../../lazyCollapse'
import type { FacetRegistry } from '../../../hooks/useEvents'
import type { EventListColumn } from './columnUtils'
import { addColumn, includesColumn } from './columnUtils'
import classes from './eventRow.module.css'

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

export const EventRow = React.memo(
  ({
    event,
    columns,
    facetRegistry,
    onColumnsChange,
  }: {
    event: SdkEvent
    columns: EventListColumn[]
    facetRegistry: FacetRegistry
    onColumnsChange: (newColumn: EventListColumn[]) => void
  }) => {
    const [isCollapsed, setIsCollapsed] = useState(true)
    const jsonRef = useRef<HTMLDivElement>(null)

    function getMenuItemsForPath(path: string) {
      const newColumn: EventListColumn = { type: 'field', path }
      if (!path || includesColumn(columns, newColumn)) {
        return null
      }
      return (
        <>
          <Menu.Item
            onClick={() => {
              onColumnsChange(addColumn(columns, newColumn))
            }}
          >
            Add column
          </Menu.Item>
        </>
      )
    }

    return (
      <Table.Tr>
        {columns.map((column, index): React.ReactElement => {
          const isLast = index === columns.length - 1
          switch (column.type) {
            case 'date':
              return (
                <Cell key="date" isLast={isLast}>
                  {formatDate(event.date)}
                </Cell>
              )
            case 'description':
              return (
                <Cell
                  key="description"
                  isLast={isLast}
                  className={classes.descriptionCell}
                  onClick={(event) => {
                    if (jsonRef.current?.contains(event.target as Node)) {
                      // Ignore clicks on the collapsible area
                      return
                    }
                    setIsCollapsed((previous) => !previous)
                  }}
                >
                  <EventDescription event={event} />
                  <LazyCollapse in={!isCollapsed}>
                    <Json
                      ref={jsonRef}
                      value={event}
                      defaultCollapseLevel={0}
                      getMenuItemsForPath={getMenuItemsForPath}
                      formatValue={formatValue}
                      mt="xs"
                    />
                  </LazyCollapse>
                </Cell>
              )
            case 'type':
              return (
                <Cell key="type" isLast={isLast}>
                  {isRumEvent(event) || isTelemetryEvent(event) ? (
                    <Badge variant="outline" color={RUM_EVENT_TYPE_COLOR[event.type]}>
                      {event.type}
                    </Badge>
                  ) : (
                    <Badge variant="dot" color={LOG_STATUS_COLOR[event.status]}>
                      {event.origin as string} {event.status as string}
                    </Badge>
                  )}
                </Cell>
              )
            case 'field': {
              const value = facetRegistry.getFieldValueForEvent(event, column.path)
              return (
                <Cell key={`field-${column.path}`} isLast={isLast}>
                  {value !== undefined && (
                    <Json
                      value={value}
                      defaultCollapseLevel={0}
                      getMenuItemsForPath={(path) => getMenuItemsForPath(path ? `${column.path}.${path}` : column.path)}
                      formatValue={(path, value) => formatValue(path ? `${column.path}.${path}` : column.path, value)}
                    />
                  )}
                </Cell>
              )
            }
          }
        })}
      </Table.Tr>
    )
  }
)

function Cell({
  isLast,
  children,
  className,
  onClick,
}: {
  isLast: boolean
  children: ReactNode
  className?: string
  onClick?: ComponentPropsWithoutRef<'td'>['onClick']
}) {
  return (
    <Table.Td colSpan={isLast ? 2 : 1} className={clsx(className, classes.cell)} onClick={onClick}>
      {children}
    </Table.Td>
  )
}

function formatValue(path: string, value: unknown) {
  if (typeof value === 'number') {
    if (path === 'date') {
      return formatDate(value)
    }
    if (
      path.endsWith('.first_byte') ||
      path.endsWith('.dom_complete') ||
      path.endsWith('.dom_content_loaded') ||
      path.endsWith('.dom_interactive') ||
      path.endsWith('.first_contentful_paint') ||
      path.endsWith('.largest_contentful_paint') ||
      path.endsWith('.load_event') ||
      path.endsWith('.time_spent') ||
      path.endsWith('_time') ||
      path.endsWith('_delay') ||
      path.endsWith('.duration') ||
      path.endsWith('.start') ||
      path.includes('.custom_timings.')
    ) {
      return formatDuration(value)
    }
  }

  return defaultFormatValue(path, value)
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
  return <strong>{children}</strong>
}

function getViewName(view: { name?: string; url: string }) {
  return `${view.name || new URL(view.url).pathname}`
}
