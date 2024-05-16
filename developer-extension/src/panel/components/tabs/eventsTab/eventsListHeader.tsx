import React, { forwardRef } from 'react'
import { CloseButton, Flex, Table } from '@mantine/core'
import type { FacetRegistry } from '../../../hooks/useEvents'
import type { EventListColumn } from './columnUtils'
import { removeColumn, getColumnTitle } from './columnUtils'
import { AddColumnPopover } from './addColumnPopover'
import * as classes from './eventsListHeader.module.css'

interface Props {
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
  facetRegistry: FacetRegistry
}

export const EventsListHeader = forwardRef<HTMLTableRowElement, Props>(
  ({ columns, onColumnsChange, facetRegistry }, forwardedRef) => (
    <Table.Thead className={classes.root}>
      <Table.Tr ref={forwardedRef}>
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
  )
)

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
