import { Tabs } from 'bumbag'
import React from 'react'
import { ActionsTab } from './tabs/actionsTab'
import { ConfigTab } from './tabs/configTab'
import { sendAction } from './actions'

export function Panel() {
  setInterval(() => {
    sendAction('getConfig', 'rum')
    sendAction('getConfig', 'logs')
  }, 2000)

  chrome.devtools.network.onNavigated.addListener(() => {
    sendAction('getConfig', 'rum')
    sendAction('getConfig', 'logs')
  })
  return (
    <Tabs>
      <Tabs.List>
        <Tabs.Tab tabId="tab1">Actions</Tabs.Tab>
        <Tabs.Tab tabId="tab2">RUM Config</Tabs.Tab>
        <Tabs.Tab tabId="tab3">Logs Config</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel tabId="tab1" padding="major-2">
        <ActionsTab />
      </Tabs.Panel>
      <Tabs.Panel tabId="tab2" padding="major-2">
        <ConfigTab product={'rum'} />
      </Tabs.Panel>
      <Tabs.Panel tabId="tab3" padding="major-2">
        <ConfigTab product={'logs'} />
      </Tabs.Panel>
    </Tabs>
  )
}
