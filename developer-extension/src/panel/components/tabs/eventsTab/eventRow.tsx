import { Table, Badge, Menu } from '@mantine/core'
import { IconCopy, IconDotsVertical, IconColumnInsertRight } from '@tabler/icons-react'
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
  RumVitalEvent,
} from '../../../../../../packages/rum-core/src/rumEvent.types'
import type { SdkEvent } from '../../../sdkEvent'
import { isTelemetryEvent, isLogEvent, isRumEvent } from '../../../sdkEvent'
import { formatDate, formatDuration } from '../../../formatNumber'
import { CopyMenuItem, defaultFormatValue, Json } from '../../json'
import { LazyCollapse } from '../../lazyCollapse'
import type { FacetRegistry } from '../../../hooks/useEvents'
import { useSdkInfos } from '../../../hooks/useSdkInfos'
import type { EventListColumn } from './columnUtils'
import { addColumn, includesColumn } from './columnUtils'
import * as classes from './eventRow.module.css'
import { RowButton } from './rowButton'
import { canCopyEvent, copyEventAsCurl, copyEventAsFetch } from './copyEvent'

const RUM_EVENT_TYPE_COLOR = {
  action: 'violet',
  error: 'red',
  long_task: 'yellow',
  view: 'blue',
  resource: 'cyan',
  telemetry: 'teal',
  vital: 'orange',
}

const LOG_STATUS_COLOR = {
  emerg: 'red',
  alert: 'red',
  critical: 'red',
  error: 'red',
  warn: 'yellow',
  notice: 'blue',
  info: 'blue',
  debug: 'cyan',
  ok: 'cyan',
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

    function getMenuItemsForPath(path: string, value?: unknown) {
      const menuItems: ReactNode[] = []

      const newColumn: EventListColumn = { type: 'field', path }
      if (path && !includesColumn(columns, newColumn)) {
        menuItems.push(
          <>
            <Menu.Item
              onClick={() => {
                onColumnsChange(addColumn(columns, newColumn))
              }}
              leftSection={<IconColumnInsertRight size={14} />}
            >
              Add column
            </Menu.Item>
          </>
        )
      }
      if (typeof value === 'string') {
        const searchTerm = String(value).replace(/ /g, '\\ ')
        menuItems.push(<CopyMenuItem value={`${path}:${searchTerm}`}>Copy search query</CopyMenuItem>)
      }
      return <>{menuItems}</>
    }

    return (
      <Table.Tr>
        {columns.map((column): React.ReactElement => {
          switch (column.type) {
            case 'date':
              return (
                <Cell key="date" noWrap>
                  {formatDate(event.date)}
                </Cell>
              )
            case 'description':
              return (
                <Cell
                  key="description"
                  className={classes.descriptionCell}
                  onClick={(event) => {
                    const target = event.target as Element

                    // Ignore clicks on menus or the JSON contained in the collapsible area
                    if (target.matches('[role="menu"] *') || jsonRef.current?.contains(target)) {
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
                <Cell key="type">
                  <EventTypeBadge event={event} />
                </Cell>
              )
            case 'field': {
              const value = facetRegistry.getFieldValueForEvent(event, column.path)
              return (
                <Cell key={`field-${column.path}`}>
                  {value !== undefined && (
                    <Json
                      value={value}
                      defaultCollapseLevel={0}
                      getMenuItemsForPath={(path) =>
                        getMenuItemsForPath(path ? `${column.path}.${path}` : column.path, value)
                      }
                      formatValue={(path, value) => formatValue(path ? `${column.path}.${path}` : column.path, value)}
                    />
                  )}
                </Cell>
              )
            }
          }
        })}
        <Cell>
          <EventMenu event={event} />
        </Cell>
      </Table.Tr>
    )
  }
)

function EventTypeBadge({ event }: { event: SdkEvent }) {
  let label: string
  let variant: string
  let color: string
  if (isRumEvent(event) || isTelemetryEvent(event)) {
    label = event.type
    variant = 'outline'
    color = RUM_EVENT_TYPE_COLOR[event.type]
  } else {
    label = `${event.origin} ${event.status}`
    variant = 'dot'
    color = LOG_STATUS_COLOR[event.status]
  }

  return (
    <Badge
      variant={variant}
      color={color}
      styles={{
        label: { overflow: 'visible' },
      }}
    >
      {label}
    </Badge>
  )
}

function EventMenu({ event }: { event: SdkEvent }) {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <RowButton icon={IconDotsVertical} title="Actions" />
      </Menu.Target>

      <Menu.Dropdown>
        <EventMenuDropdown event={event} />
      </Menu.Dropdown>
    </Menu>
  )
}

function EventMenuDropdown({ event }: { event: SdkEvent }) {
  const infos = useSdkInfos()
  if (!canCopyEvent(infos, event)) {
    return (
      <>
        <Menu.Item disabled>Copy as cURL</Menu.Item>
        <Menu.Item disabled>Copy as fetch</Menu.Item>
      </>
    )
  }
  return (
    <>
      <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => copyEventAsCurl(infos, event)}>
        Copy as cURL
      </Menu.Item>
      <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => copyEventAsFetch(infos, event)}>
        Copy as fetch
      </Menu.Item>
    </>
  )
}

function Cell({
  children,
  className,
  onClick,
  noWrap,
}: {
  children: ReactNode
  className?: string
  onClick?: ComponentPropsWithoutRef<'td'>['onClick']
  noWrap?: boolean
}) {
  return (
    <Table.Td className={clsx(className, classes.cell)} data-no-wrap={noWrap || undefined} onClick={onClick}>
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
      case 'vital':
        return <VitalDescription event={event} />
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
  if (event.telemetry.type === 'usage') {
    return (
      <>
        <Emphasis>Usage</Emphasis> of <Emphasis>{event.telemetry.usage.feature}</Emphasis>
      </>
    )
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

function VitalDescription({ event }: { event: RumVitalEvent }) {
  const vitalName = event.vital.name
  const vitalValue = event.vital.duration
  const vitalDescription = event.vital.description
  return (
    <>
      Custom <Emphasis>{event.vital.type}</Emphasis> vital:{' '}
      <Emphasis>
        {vitalName}
        {vitalDescription && ` - ${vitalDescription}`}
      </Emphasis>
      {vitalValue !== undefined && (
        <>
          {' '}
          of <Emphasis>{formatDuration(vitalValue)}</Emphasis>
        </>
      )}
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
