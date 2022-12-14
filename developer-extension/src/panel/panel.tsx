import React, { useState } from 'react'
import { Tabs, Text } from '@mantine/core'

import type { Settings } from './components/settingsTab'
import { SettingsTab } from './components/settingsTab'
import { InfosTab } from './components/infosTab'
import { useEvents } from './hooks/useEvents'
import { EventTab } from './components/eventsTab'
import { useStore } from './hooks/useStore'
import { useAutoFlushEvents } from './hooks/useAutoFlushEvents'

const enum PanelTabs {
  Events = 'events',
  Infos = 'infos',
  Settings = 'settings',
}

export function Panel() {
  const [{ devServerStatus, ...settingsFromStore }, setStore] = useStore()
  const [settingsFromMemory, setSettingsFromMemory] = useState<
    Pick<Settings, 'autoFlush' | 'preserveEvents' | 'eventSource'>
  >({
    preserveEvents: false,
    autoFlush: true,
    eventSource: 'requests',
  })

  useAutoFlushEvents(settingsFromMemory.autoFlush)

  const settings: Settings = { ...settingsFromStore, ...settingsFromMemory }

  const { events, filters, setFilters, clear } = useEvents(settings)

  return (
    <Tabs
      color="violet"
      defaultValue={PanelTabs.Events}
      sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <Tabs.List>
        <Tabs.Tab value={PanelTabs.Events}>Events</Tabs.Tab>
        <Tabs.Tab value={PanelTabs.Infos}>
          <Text>Infos</Text>
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
      <Tabs.Panel value={PanelTabs.Settings} sx={{ flex: 1, minHeight: 0 }}>
        <SettingsTab
          settings={settings}
          setSettings={(newSettings) => {
            for (const [name, value] of Object.entries(newSettings)) {
              if (name in settingsFromMemory) {
                setSettingsFromMemory((oldSettings) => ({
                  ...oldSettings,
                  [name]: value,
                }))
              } else {
                setStore({ [name]: value })
              }
            }
          }}
          devServerStatus={devServerStatus}
        />
      </Tabs.Panel>
    </Tabs>
  )
}

function isInterceptingNetworkRequests(settings: Settings) {
  return settings.blockIntakeRequests || settings.useDevBundles || settings.useRumSlim
}
