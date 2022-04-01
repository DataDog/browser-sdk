import { Tabs } from '@mantine/core'
import React, { useState } from 'react'
import { ActionsTab } from './tabs/actionsTab'
import { ConfigTab } from './tabs/configTab'
import { EventTab } from './tabs/eventsTab'

const enum PanelTabs {
  Actions,
  RumConfig,
  LogsConfig,
}

export function Panel() {
  const [activeTab, setActiveTab] = useState(PanelTabs.Actions)

  return (
    <Tabs active={activeTab} onTabChange={setActiveTab}>
      <Tabs.Tab label="Actions">
        <ActionsTab />
      </Tabs.Tab>
      <Tabs.Tab label="Config">
        <ConfigTab />
      </Tabs.Tab>
      <Tabs.Tab label="Events">
        <EventTab />
      </Tabs.Tab>
    </Tabs>
  )
}
