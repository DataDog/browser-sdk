import { Button, Group, TextInput } from '@mantine/core'
import React from 'react'
import { flushEvents } from '../../../flushEvents'
import type { EventFilters } from '../../../hooks/useEvents'
import * as classes from './eventsTabTop.module.css'

export function EventsTabTop({
  filters,
  onFiltersChange,
  clear,
}: {
  filters: EventFilters
  onFiltersChange: (filters: EventFilters) => void
  clear: () => void
}) {
  return (
    <Group className="dd-privacy-allow">
      <TextInput
        placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
        value={filters.query}
        className={classes.textInput}
        onChange={(event) => onFiltersChange({ ...filters, query: event.currentTarget.value })}
        data-dd-privacy="mask"
      />

      <Button color="violet" variant="light" onClick={flushEvents}>
        Flush
      </Button>
      <Button color="red" variant="light" onClick={clear}>
        Clear
      </Button>
    </Group>
  )
}
