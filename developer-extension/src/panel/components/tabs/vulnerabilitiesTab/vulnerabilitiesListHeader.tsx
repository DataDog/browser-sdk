import React, { forwardRef } from 'react'
import { Flex, Table } from '@mantine/core'
import type { VulnerabilitiesListColumn } from './columnUtils'
import { getColumnTitle } from './columnUtils'
import classes from './vulnerabilitiesListHeader.module.css'

interface Props {
  columns: VulnerabilitiesListColumn[]
}

export const VulnerabilitiesListHeader = forwardRef<HTMLTableRowElement, Props>(
  ({ columns }, forwardedRef) => (
    <Table.Thead className={classes.root}>
      <Table.Tr ref={forwardedRef}>
        {columns.map((column) => (
          <ColumnHeader
            key={column.type === 'field' ? `field-${column.path}` : column.type}
            column={column}
          ></ColumnHeader>
        ))}
      </Table.Tr>
      <div className={classes.headerRowShadow} />
    </Table.Thead>
  )
)

function ColumnHeader({
  column
}: {
  column: VulnerabilitiesListColumn
}) {
  return (
    <Table.Th
      key={column.type === 'field' ? `field-${column.path}` : column.type}
      data-header-cell
      className={classes.columnHeader}
    >
      <Flex justify="space-between" gap="sm" align="center">
        {getColumnTitle(column)}
      </Flex>
    </Table.Th>
  )
}
