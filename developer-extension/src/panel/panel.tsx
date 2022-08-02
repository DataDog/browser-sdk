import { Divider, Tabs } from '@mantine/core'
import React from 'react'
import { ActionsBar } from './components/actionsBar'
import { InfosTab } from './components/infosTab'
import { useEvents } from './hooks/useEvents'
import { EventTab } from './components/eventsTab'

const enum PanelTabs {
  Events = 'events',
  Infos = 'infos',
}

export function Panel() {
  const { events, filters, setFilters, clear } = useEvents()

  return (
    <>
      <ActionsBar />
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
