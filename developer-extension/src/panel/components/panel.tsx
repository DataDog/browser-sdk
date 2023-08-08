import React, { useState } from 'react'
import { Tabs, Text } from '@mantine/core'
import { datadogRum } from '@datadog/browser-rum'

import { useEvents } from '../hooks/useEvents'
import { useAutoFlushEvents } from '../hooks/useAutoFlushEvents'
import { useNetworkRules } from '../hooks/useNetworkRules'
import type { Settings } from '../hooks/useSettings'
import { useSettings } from '../hooks/useSettings'
import { DEFAULT_PANEL_TAB, PanelTabs } from '../../common/constants'
import { SettingsTab } from './tabs/settingsTab'
import { InfosTab } from './tabs/infosTab'
import { EventTab } from './tabs/eventsTab'
import { ReplayTab } from './tabs/replayTab'

export function Panel() {
  const [settings] = useSettings()

  useAutoFlushEvents(settings.autoFlush)
  useNetworkRules(settings)

  const { events, filters, setFilters, clear } = useEvents(settings)

  const [activeTab, setActiveTab] = useState<string | null>(DEFAULT_PANEL_TAB)
  function updateActiveTab(activeTab: string | null) {
    setActiveTab(activeTab)
    activeTab && datadogRum.startView(activeTab)
  }

  return (
    <Tabs
      color="violet"
      value={activeTab}
      sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
      onTabChange={updateActiveTab}
    >
      <Tabs.List className="dd-privacy-allow">
        <Tabs.Tab value={PanelTabs.Events}>Events</Tabs.Tab>
        <Tabs.Tab value={PanelTabs.Infos}>
          <Text>Infos</Text>
        </Tabs.Tab>
        <Tabs.Tab value={PanelTabs.Replay}>
          <Text>Live replay</Text>
        </Tabs.Tab>
        <Tabs.Tab
          value={PanelTabs.Settings}
          rightSection={
            isInterceptingNetworkRequests(settings) && (
              <Text c="orange" fw="bold" title="Intercepting network requests">
                ⚠
              </Text>
            )
          }
        >
          Settings
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value={PanelTabs.Events} sx={{ flex: 1, minHeight: 0 }}>
        <EventTab events={events} filters={filters} onFiltered={setFilters} clear={clear} />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Infos} sx={{ flex: 1, minHeight: 0 }}>
        <InfosTab />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Replay} sx={{ flex: 1, minHeight: 0 }}>
        <ReplayTab />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Settings} sx={{ flex: 1, minHeight: 0 }}>
        <SettingsTab />
      </Tabs.Panel>
    </Tabs>
  )
}

function isInterceptingNetworkRequests(settings: Settings) {
  return settings.blockIntakeRequests || settings.useDevBundles || settings.useRumSlim
}
