import React, { useState } from 'react'
import { Divider, Tabs } from '@mantine/core'

import { ActionsBar } from './components/actionsBar'
import { InfosTab } from './components/infosTab'
import { useEvents } from './hooks/useEvents'
import { EventTab } from './components/eventsTab'

const enum PanelTabs {
  Events = 'events',
  Infos = 'infos',
}

export function Panel() {
  const [preserveEvents, setPreserveEvents] = useState(false)
  const { events, filters, setFilters, clear } = useEvents(preserveEvents)

  return (
    <>
      <ActionsBar preserveEvents={preserveEvents} setPreserveEvents={setPreserveEvents} />
      <Divider my="xs" />
      <Tabs color="violet" defaultValue={PanelTabs.Events}>
        <Tabs.List>
          <Tabs.Tab value={PanelTabs.Events}>Events</Tabs.Tab>
          <Tabs.Tab value={PanelTabs.Infos}>Infos</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={PanelTabs.Events}>
          <EventTab events={events} filters={filters} onFiltered={setFilters} clear={clear} />
        </Tabs.Panel>
        <Tabs.Panel value={PanelTabs.Infos}>
          <InfosTab />
        </Tabs.Panel>
      </Tabs>
    </>
  )
}
