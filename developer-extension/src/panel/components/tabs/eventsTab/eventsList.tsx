import { Popover, Box, Text, Button, Flex, Autocomplete, Table, useMantineTheme, CloseButton } from '@mantine/core'
import type { ForwardedRef, ReactNode } from 'react'
import React, { useMemo, useRef, useState, forwardRef } from 'react'
import type { EventFilters, FacetRegistry } from '../../../hooks/useEvents'
import type { SdkEvent } from '../../../sdkEvent'
import { isRumViewEvent } from '../../../sdkEvent'
import { BORDER_RADIUS, separatorBorder } from '../../../uiUtils'
import type { EventListColumn } from './columnUtils'
import { removeColumn, getColumnTitle, DEFAULT_COLUMNS, includesColumn } from './columnUtils'
import { EventRow } from './eventRow'
import { ColumnDrag } from './columnDrag'

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
  const theme = useMantineTheme()

  return (
    <Box
      mx="md"
      mb="md"
      sx={{
        border: separatorBorder(theme),
        borderRadius: BORDER_RADIUS,
      }}
    >
      <Table>
        <thead>
          <tr ref={headerRowRef}>
            {columns.map((column) => (
              <ColumnHeader
                key={column.type === 'field' ? `field-${column.path}` : column.type}
                columns={columns}
                column={column}
                onColumnsChange={onColumnsChange}
              ></ColumnHeader>
            ))}
            <Box component="th" sx={{ width: 0 }}>
              <AddColumnPopover columns={columns} onColumnsChange={onColumnsChange} facetRegistry={facetRegistry} />
            </Box>
          </tr>
        </thead>

        <tbody>
          {events.map((event) => (
            <EventRow
              key={getEventRenderingKey(event, !filters.outdatedVersions)}
              event={event}
              columns={columns}
              onColumnsChange={onColumnsChange}
              facetRegistry={facetRegistry}
            />
          ))}
        </tbody>
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
    <Box
      component="th"
      key={column.type === 'field' ? `field-${column.path}` : column.type}
      data-header-cell
      sx={{
        '& .mantine-CloseButton-root': {
          opacity: 0,
        },
        '&:hover': {
          '& .mantine-CloseButton-root': {
            opacity: 1,
          },
        },
      }}
    >
      <Flex gap="sm" align="center">
        <Flex justify="space-between" gap="sm" align="center" sx={{ flex: 1 }}>
          {getColumnTitle(column)}
          <CloseButton size="xs" variant="filled" onClick={() => onColumnsChange(removeColumn(columns, column))} />
        </Flex>
      </Flex>
    </Box>
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
        <Button variant="light" compact my="-sm">
          Add column
        </Button>
      </Popover.Target>
      <Popover.Dropdown
        sx={(theme) => ({ background: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white })}
      >
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

  const suggestions = allPaths.filter((path) => path.includes(input))

  return (
    <Flex align="flex-end" gap="sm">
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault()
          addFieldColumn(input)
        }}
        sx={{ display: 'contents' }}
      >
        <Autocomplete
          sx={{ flex: 1 }}
          value={input}
          label="Field"
          onChange={setInput}
          data={suggestions}
          placeholder="foo.bar"
          itemComponent={forwardRef(({ value, ...props }: { value: string }, ref: ForwardedRef<HTMLDivElement>) => {
            const inputIndex = value.indexOf(input)
            let renderedValue: ReactNode
            if (inputIndex < 0) {
              renderedValue = value
            } else {
              renderedValue = (
                <>
                  {value.slice(0, inputIndex)}
                  <Text component="span" underline>
                    {value.slice(inputIndex, inputIndex + input.length)}
                  </Text>
                  {value.slice(inputIndex + input.length)}
                </>
              )
            }

            return (
              <Box {...props} ref={ref}>
                {renderedValue}
              </Box>
            )
          })}
          onItemSubmit={({ value }) => addFieldColumn(value)}
        />
        <Button type="submit">Add</Button>
      </Box>
    </Flex>
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
