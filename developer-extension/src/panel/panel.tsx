import { Tabs } from '@mantine/core'
import React, { useState } from 'react'
import { ActionsTab } from './tabs/actionsTab'
import { ConfigTab } from './tabs/configTab'
import { sendAction } from './actions'

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

  return (
    <Tabs active={activeTab} onTabChange={setActiveTab}>
      <Tabs.Tab label="Actions">
        <ActionsTab />
      </Tabs.Tab>
      <Tabs.Tab label="RUM Config">
        <ConfigTab product={'rum'} />
      </Tabs.Tab>
      <Tabs.Tab label="Logs Config">
        <ConfigTab product={'logs'} />
      </Tabs.Tab>
    </Tabs>
  )
}
