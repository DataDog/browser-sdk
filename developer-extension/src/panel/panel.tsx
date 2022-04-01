import { Space, Tabs } from '@mantine/core'
import React, { useState } from 'react'
import { ActionsBar } from './components/actionsBar'
import { ConfigTab } from './components/configTab'
import { sendAction } from './actions'
import { useEvents } from './hooks/useEvents'
import { EventTab } from './components/eventsTab'

const enum PanelTabs {
  Actions,
  RumConfig,
  LogsConfig,
}

export function Panel() {
  setInterval(() => {
    sendAction('getConfig', 'rum')
    sendAction('getConfig', 'logs')
  }, 2000)

  chrome.devtools.network.onNavigated.addListener(() => {
    sendAction('getConfig', 'rum')
    sendAction('getConfig', 'logs')
  })
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
        <Tabs.Tab label="RUM Config">
          <ConfigTab product={'rum'} />
        </Tabs.Tab>
        <Tabs.Tab label="Logs Config">
          <ConfigTab product={'logs'} />
        </Tabs.Tab>
      </Tabs>
    </>
  )
}
