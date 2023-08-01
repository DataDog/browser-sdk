import { Button, Checkbox, Chip, Group, TextInput } from '@mantine/core'
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
      <Chip.Group
        multiple
        value={filters.sdk}
        onChange={(sdk) => onFiltered({ ...filters, sdk: sdk as Array<'rum' | 'logs'> })}
      >
        <Chip value="rum">RUM</Chip>
        <Chip value="logs">Logs</Chip>
        <Chip value="telemetry">Telemetry</Chip>
      </Chip.Group>
      <Checkbox
        label="Show only the latest View event"
        checked={!filters.outdatedVersions}
        onChange={(e) => onFiltered({ ...filters, outdatedVersions: !e.target.checked })}
      />
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
