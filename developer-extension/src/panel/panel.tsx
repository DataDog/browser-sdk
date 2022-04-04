import { Space, Tabs } from '@mantine/core'
import React, { useState } from 'react'
import { ActionsBar } from './components/actionsBar'
import { ConfigTab } from './components/configTab'
import { useEvents } from './hooks/useEvents'
import { EventTab } from './components/eventsTab'

const enum PanelTabs {
  Actions,
  RumConfig,
  LogsConfig,
}

export function Panel() {
  const [activeTab, setActiveTab] = useState(PanelTabs.Actions)
  const { events, filters, setFilters } = useEvents()

  return (
    <>
      <ActionsBar />
      <Space h="md" />
      <Tabs color="violet" active={activeTab} onTabChange={setActiveTab}>
        <Tabs.Tab label="Events">
          <EventTab events={events} filters={filters} onFiltered={setFilters} />
        </Tabs.Tab>
        <Tabs.Tab label="Config">
          <ConfigTab />
        </Tabs.Tab>
      </Tabs>
    </>
  )
}
