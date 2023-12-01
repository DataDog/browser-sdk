import { Flex, Table, CloseButton } from '@mantine/core'
import React, { useRef } from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import type { SdkEvent } from '../../../sdkEvent'
import { isRumViewEvent } from '../../../sdkEvent'
import type { EventListColumn } from './columnUtils'
import { removeColumn, getColumnTitle } from './columnUtils'
import { EventRow } from './eventRow'
import { ColumnDrag } from './columnDrag'
import classes from './eventsList.module.css'
import { AddColumnPopover } from './addColumnPopover'

export function EventsList({
  events,
  filters,
  facetRegistry,
  columns,
  onColumnsChange,
}: {
  events: SdkEvent[]
  filters: EventFilters
  facetRegistry: FacetRegistry
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
}) {
  const headerRowRef = useRef<HTMLTableRowElement>(null)

  return (
    <div className={classes.root}>
      <Table stickyHeader>
        <Table.Thead>
          <Table.Tr ref={headerRowRef}>
            {columns.map((column) => (
              <ColumnHeader
                key={column.type === 'field' ? `field-${column.path}` : column.type}
                columns={columns}
                column={column}
                onColumnsChange={onColumnsChange}
              ></ColumnHeader>
            ))}
            <Table.Td className={classes.addColumnCell}>
              <AddColumnPopover columns={columns} onColumnsChange={onColumnsChange} facetRegistry={facetRegistry} />
            </Table.Td>
          </Table.Tr>
          <div className={classes.headerRowShadow} />
        </Table.Thead>

        <Table.Tbody>
          {events.map((event) => (
            <EventRow
              key={getEventRenderingKey(event, !filters.outdatedVersions)}
              event={event}
              columns={columns}
              onColumnsChange={onColumnsChange}
              facetRegistry={facetRegistry}
            />
          ))}
        </Table.Tbody>
      </Table>

      <ColumnDrag columns={columns} onColumnsChange={onColumnsChange} headerRowRef={headerRowRef} />
    </div>
  )
}

function ColumnHeader({
  columns,
  column,
  onColumnsChange,
}: {
  columns: EventListColumn[]
  column: EventListColumn
  onColumnsChange: (columns: EventListColumn[]) => void
}) {
  return (
    <Table.Th
      key={column.type === 'field' ? `field-${column.path}` : column.type}
      data-header-cell
      className={classes.columnHeader}
    >
      <Flex justify="space-between" gap="sm" align="center">
        {getColumnTitle(column)}
        <CloseButton size="xs" variant="filled" onClick={() => onColumnsChange(removeColumn(columns, column))} />
      </Flex>
    </Table.Th>
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
