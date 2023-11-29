import type { OptionsFilter } from '@mantine/core'
import { Popover, Box, Text, Button, Flex, Autocomplete, Table, CloseButton } from '@mantine/core'
import React, { useMemo, useRef, useState } from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import type { SdkEvent } from '../../../sdkEvent'
import { isRumViewEvent } from '../../../sdkEvent'
import type { EventListColumn } from './columnUtils'
import { removeColumn, getColumnTitle, DEFAULT_COLUMNS, includesColumn } from './columnUtils'
import { EventRow } from './eventRow'
import { ColumnDrag } from './columnDrag'
import classes from './eventsList.module.css'

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
    <Box className={classes.root}>
      <Table>
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
    </Box>
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

function AddColumnPopover({
  columns,
  onColumnsChange,
  facetRegistry,
}: {
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
  facetRegistry: FacetRegistry
}) {
  return (
    <Popover width={300} trapFocus position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Button variant="light" size="compact-md" my="-sm">
          Add column
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Flex direction="column" gap="sm">
          {DEFAULT_COLUMNS.map((column) => (
            <AddDefaultColumnButton
              key={column.type}
              column={column}
              columns={columns}
              onColumnsChange={onColumnsChange}
            />
          ))}
          <AddFieldColumn columns={columns} onColumnsChange={onColumnsChange} facetRegistry={facetRegistry} />
        </Flex>
      </Popover.Dropdown>
    </Popover>
  )
}

function AddDefaultColumnButton({
  column,
  columns,
  onColumnsChange,
}: {
  column: EventListColumn
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
}) {
  if (includesColumn(columns, column)) {
    return null
  }
  return (
    <Flex justify="space-between" align="center" gap="sm">
      <Text>{getColumnTitle(column)}</Text>
      <Button
        onClick={() => {
          onColumnsChange(columns.concat(column))
        }}
      >
        Add
      </Button>
    </Flex>
  )
}

function AddFieldColumn({
  columns,
  onColumnsChange,
  facetRegistry,
}: {
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
  facetRegistry: FacetRegistry
}) {
  const [input, setInput] = useState('')

  function addFieldColumn(path: string) {
    const newColumn: EventListColumn = { path, type: 'field' }
    if (!includesColumn(columns, newColumn)) {
      onColumnsChange(columns.concat(newColumn))
    }
  }

  const allPaths = useMemo(
    () =>
      Array.from(facetRegistry.getAllFieldPaths()).sort((a, b) => {
        // Sort private fields last
        if (a.startsWith('_dd') !== b.startsWith('_dd')) {
          if (a.startsWith('_dd')) {
            return 1
          }
          if (b.startsWith('_dd')) {
            return -1
          }
        }
        return a < b ? -1 : 1
      }),
    []
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        addFieldColumn(input)
      }}
      className={classes.addFieldColumn}
    >
      <Autocomplete
        className={classes.addFieldAutocomplete}
        value={input}
        label="Field"
        onChange={setInput}
        data={allPaths}
        filter={filterColumns}
        placeholder="foo.bar"
        onOptionSubmit={addFieldColumn}
      />
      <Button type="submit">Add</Button>
    </form>
  )
}

function filterColumns(filterOptions: Parameters<OptionsFilter>[0]): ReturnType<OptionsFilter> {
  if (!filterOptions.search) {
    return filterOptions.options
  }
  const filteredOptions = filterOptions.options.flatMap((option) => {
    if (!('value' in option)) {
      return []
    }

    const inputIndex = option.value.indexOf(filterOptions.search)
    if (inputIndex < 0) {
      return []
    }

    return [
      {
        value: option.value,
        label: (
          <span>
            {option.value.slice(0, inputIndex)}
            <span className={classes.addFilterAutocompleteHighlight}>
              {option.value.slice(inputIndex, inputIndex + filterOptions.search.length)}
            </span>
            {option.value.slice(inputIndex + filterOptions.search.length)}
          </span>
        ) as unknown as string,
        // Mantime types expect a string as label, but to support highlighting we need to return a
        // ReactNode. This is the simplest way to achieve this, but it might break in the future
      },
    ]
  })
  return filteredOptions
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
