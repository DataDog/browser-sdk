import React, { useState } from 'react'
import { Tabs, Text, Anchor } from '@mantine/core'
import { datadogRum } from '@datadog/browser-rum'

import { useEvents } from '../hooks/useEvents'
import { useAutoFlushEvents } from '../hooks/useAutoFlushEvents'
import { useNetworkRules } from '../hooks/useNetworkRules'
import { useSettings } from '../hooks/useSettings'
import { DEFAULT_PANEL_TAB, PanelTabs } from '../../common/panelTabConstants'
import type { Settings } from '../../common/extension.types'
import { useDebugMode } from '../hooks/useDebugMode'
import { SettingsTab } from './tabs/settingsTab'
import { InfosTab } from './tabs/infosTab'
import { EventsTab, DEFAULT_COLUMNS } from './tabs/eventsTab'
import { ReplayTab } from './tabs/replayTab'
import { TrialTab } from './tabs/trialTab'

import * as classes from './panel.module.css'

export function Panel() {
  const [settings] = useSettings()

  useAutoFlushEvents(settings.autoFlush)
  useNetworkRules(settings)
  useDebugMode(settings.debugMode)

  const { events, filters, setFilters, clear, facetRegistry } = useEvents(settings)

  const [columns, setColumns] = useState(DEFAULT_COLUMNS)

  const [activeTab, setActiveTab] = useState<string | null>(DEFAULT_PANEL_TAB)
  function updateActiveTab(activeTab: string | null) {
    setActiveTab(activeTab)
    datadogRum.startView(activeTab!)
  }

  return (
    <Tabs color="violet" value={activeTab} className={classes.tabs} onChange={updateActiveTab}>
      <Tabs.List className={classes.topBox} data-dd-privacy="allow">
        <div className={classes.tabBox}>
          <Tabs.Tab value={PanelTabs.Events}>Events</Tabs.Tab>
          <Tabs.Tab
            value={PanelTabs.Infos}
            rightSection={
              isOverridingInitConfiguration(settings) && (
                <Text c="orange" fw="bold" title="Overriding init configuration">
                  ⚠
                </Text>
              )
            }
          >
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
          <Tabs.Tab
            value={PanelTabs.Trial}
            rightSection={
              settings.trialMode &&
              settings.sdkInjection.enabled && (
                <Text c="blue" fw="bold" title="Trial mode enabled">
                  ●
                </Text>
              )
            }
          >
            Trial
          </Tabs.Tab>
        </div>
        <Anchor
          className={classes.link}
          href="https://github.com/DataDog/browser-sdk/tree/main/developer-extension#browser-sdk-developer-extension"
          target="_blank"
        >
          🔗 Documentation
        </Anchor>
      </Tabs.List>

      <Tabs.Panel value={PanelTabs.Events} className={classes.tab}>
        <EventsTab
          events={events}
          facetRegistry={facetRegistry}
          filters={filters}
          onFiltersChange={setFilters}
          columns={columns}
          onColumnsChange={setColumns}
          clear={clear}
        />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Infos} className={classes.tab}>
        <InfosTab />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Replay} className={classes.tab}>
        <ReplayTab />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Settings} className={classes.tab}>
        <SettingsTab />
      </Tabs.Panel>
      <Tabs.Panel value={PanelTabs.Trial} className={classes.tab}>
        <TrialTab />
      </Tabs.Panel>
    </Tabs>
  )
}

function isInterceptingNetworkRequests(settings: Settings) {
  return (
    settings.blockIntakeRequests ||
    settings.useDevBundles ||
    settings.useRumSlim ||
    (settings.trialMode && settings.sdkInjection.enabled)
  )
}

function isOverridingInitConfiguration(settings: Settings) {
  return settings.rumConfigurationOverride || settings.logsConfigurationOverride
}
