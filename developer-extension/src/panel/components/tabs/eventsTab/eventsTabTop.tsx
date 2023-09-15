import { Button, Group, TextInput } from '@mantine/core'
import React from 'react'
import { flushEvents } from '../../../flushEvents'
import type { EventFilters } from '../../../hooks/useEvents'

export function EventsTabTop({
  filters,
  onFiltered,
  clear,
}: {
  filters: EventFilters
  onFiltered: (filters: EventFilters) => void
  clear: () => void
}) {
  return (
    <Group className="dd-privacy-allow">
      <TextInput
        placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
        value={filters.query}
        style={{ flexGrow: 1 }}
        onChange={(event) => onFiltered({ ...filters, query: event.currentTarget.value })}
        className="dd-privacy-mask"
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
