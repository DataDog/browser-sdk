import React, {useState} from 'react'
import {Anchor, Tabs, Text} from '@mantine/core'
import {datadogRum, type RumActionEvent} from '@datadog/browser-rum'

import {useEvents} from '../hooks/useEvents'
import {useAutoFlushEvents} from '../hooks/useAutoFlushEvents'
import {useNetworkRules} from '../hooks/useNetworkRules'
import {useSettings} from '../hooks/useSettings'
import {DEFAULT_PANEL_TAB, PanelTabs} from '../../common/panelTabConstants'
import type {Settings} from '../../common/extension.types'
import {useDebugMode} from '../hooks/useDebugMode'
import {SettingsTab} from './tabs/settingsTab'
import {InfosTab} from './tabs/infosTab'
import {DEFAULT_COLUMNS, EventsTab} from './tabs/eventsTab'
import {ReplayTab} from './tabs/replayTab'
import {ActionToEventsMapTab} from './tabs/actionToEventsMapTab'
import {ActionToEventsMapJsonTab} from './tabs/actionToEventsMapJsonTab'
import {CreateActionToEventsMapTab} from "./tabs/createActionToEventsMapTab";

import * as classes from './panel.module.css'
import {TrackingEventsTab} from "./tabs/trackingEventsTab";

export function Panel() {
  const [settings] = useSettings()

  useAutoFlushEvents(settings.autoFlush)
  useNetworkRules(settings)
  useDebugMode(settings.debugMode)

    const [currentTrackingEventPath0, setCurrentTrackingEventPath0] = useState<string>("")
    const [currentTrackingEventPath1, setCurrentTrackingEventPath1] = useState<string>("")
    const [currentTrackingEventPath2, setCurrentTrackingEventPath2] = useState<string>("")
    const [currentTrackingEventPath3, setCurrentTrackingEventPath3] = useState<string>("")
    const [currentTrackingEventPath4, setCurrentTrackingEventPath4] = useState<string>("")

  const {
      events, setEvents,
      filters, setFilters,
      clear,
      facetRegistry,
      actionMap, setActionMap,
      actionMapJson, setActionMapJson,
      actionMapJsonUrl, setActionMapJsonUrl,
      actionMapJsonSync, setActionMapJsonSync,
      importActionMapJson,
  } = useEvents(settings)

  const [columns, setColumns] = useState(DEFAULT_COLUMNS);


  const [activeTab, setActiveTab] = useState<string | null>(DEFAULT_PANEL_TAB)
  function updateActiveTab(activeTab: string | null) {
    setActiveTab(activeTab)
    activeTab && datadogRum.startView(activeTab)
  }

  return (
    <Tabs color="violet" value={activeTab} className={classes.tabs} onChange={updateActiveTab}>
      <Tabs.List className={classes.topBox} data-dd-privacy="allow">
        <div className={classes.tabBox}>
            <Tabs.Tab value={PanelTabs.CreateActionToEventsMap}>Map Events</Tabs.Tab>
            <Tabs.Tab value={PanelTabs.ActionToEventsMap}>Events Map </Tabs.Tab>
            <Tabs.Tab value={PanelTabs.ActionToEventsMapJson}>Events Map JSON</Tabs.Tab>
            <Tabs.Tab value={PanelTabs.TrackingEvents}>Tracking Events</Tabs.Tab>
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
        </div>
        <Anchor
          className={classes.link}
          href="https://github.com/DataDog/browser-sdk/tree/main/developer-extension#browser-sdk-developer-extension"
          target="_blank"
        >
          🔗 Documentation
        </Anchor>
      </Tabs.List>

        <Tabs.Panel value={PanelTabs.CreateActionToEventsMap} className={classes.tab}>
            <CreateActionToEventsMapTab
                sdkEvents={events}
                setSdkEvents={setEvents}
                clearEvents={clear}
                actionMap={actionMap}
                setActionMap={setActionMap}
                currentTrackingEventPath0={currentTrackingEventPath0}
                setCurrentTrackingEventPath0={setCurrentTrackingEventPath0}
                currentTrackingEventPath1={currentTrackingEventPath1}
                setCurrentTrackingEventPath1={setCurrentTrackingEventPath1}
                currentTrackingEventPath2={currentTrackingEventPath2}
                setCurrentTrackingEventPath2={setCurrentTrackingEventPath2}
                currentTrackingEventPath3={currentTrackingEventPath3}
                setCurrentTrackingEventPath3={setCurrentTrackingEventPath3}
                currentTrackingEventPath4={currentTrackingEventPath4}
                setCurrentTrackingEventPath4={setCurrentTrackingEventPath4}
            />
        </Tabs.Panel>
        <Tabs.Panel value={PanelTabs.ActionToEventsMap} className={classes.tab}>
            <ActionToEventsMapTab
                actionMap={actionMap}
                setActionMap={setActionMap}
            />
        </Tabs.Panel>
        <Tabs.Panel value={PanelTabs.ActionToEventsMapJson} className={classes.tab}>
            <ActionToEventsMapJsonTab
                actionMap={actionMap}
                setActionMap={setActionMap}
                actionMapJson={actionMapJson}
                setActionMapJson={setActionMapJson}
                actionMapJsonUrl={actionMapJsonUrl}
                setActionMapJsonUrl={setActionMapJsonUrl}
                actionMapJsonSync={actionMapJsonSync}
                setActionMapJsonSync={setActionMapJsonSync}
                importActionMapJson={importActionMapJson}
            />
        </Tabs.Panel>
        <Tabs.Panel value={PanelTabs.TrackingEvents} className={classes.tab}>
            <TrackingEventsTab
                events={events}
                actionMap={actionMap}
            />
        </Tabs.Panel>

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
    </Tabs>
  )
}

function isInterceptingNetworkRequests(settings: Settings) {
  return settings.blockIntakeRequests || settings.useDevBundles || settings.useRumSlim
}

function isOverridingInitConfiguration(settings: Settings) {
  return settings.rumConfigurationOverride || settings.logsConfigurationOverride
}
