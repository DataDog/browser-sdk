import type { OptionsFilter } from '@mantine/core'
import { Autocomplete, Button, Flex, Popover, Text } from '@mantine/core'
import { IconColumnInsertRight } from '@tabler/icons-react'
import React, { useMemo, useState } from 'react'
import type { FacetRegistry } from '../../../hooks/useEvents'
import type { EventListColumn } from './columnUtils'
import { getColumnTitle, includesColumn, DEFAULT_COLUMNS } from './columnUtils'
import { RowButton } from './rowButton'
import * as classes from './addColumnPopover.module.css'

export function AddColumnPopover({
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
        <RowButton title="Add column" icon={IconColumnInsertRight} />
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
    const newColumn: EventListColumn = { type: 'field', path }
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
