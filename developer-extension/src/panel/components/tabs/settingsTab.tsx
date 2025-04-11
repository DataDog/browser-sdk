import { Badge, Box, Button, Checkbox, Code, Group, Space, Text, TextInput, SegmentedControl } from '@mantine/core'
import React, { useState } from 'react'
import { evalInWindow } from '../../evalInWindow'
import { DevServerStatus, useDevServerStatus } from '../../hooks/useDevServerStatus'
import { useSettings } from '../../hooks/useSettings'
import { useSdkInfos } from '../../hooks/useSdkInfos'
import { createLogger } from '../../../common/logger'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { DevBundlesOverride, EventCollectionStrategy } from '../../../common/extension.types'
import * as classes from './settingsTab.module.css'

const logger = createLogger('settingsTab')

export function SettingsTab() {
  const devServerStatus = useDevServerStatus()
  const [
    {
      useDevBundles,
      useRumSlim,
      blockIntakeRequests,
      preserveEvents,
      eventCollectionStrategy,
      autoFlush,
      debugMode: debug,
      applicationId,
      clientToken,
      overrideOrgAndApp,
    },
    setSetting,
  ] = useSettings()

  const config = useSdkInfos()?.rum?.config as { clientToken: string; applicationId: string } | undefined
  const currentApplicationId = config?.applicationId
  const currentClientToken = config?.clientToken

  const [currentOverrideOrgAndApp, setCurrentOverrideOrgAndApp] = useState(overrideOrgAndApp)

  const needsPageRefresh = () => (
    currentOverrideOrgAndApp !== overrideOrgAndApp ||
    (currentOverrideOrgAndApp && (currentApplicationId !== applicationId || currentClientToken !== clientToken))
  )

  const reloadInPage = () => {
    setCurrentOverrideOrgAndApp(overrideOrgAndApp)
    evalInWindow('window.location.reload()').catch((error) => logger.error('Error while reloading the page:', error));
  }

  return (
    <TabBase>
      <div className="dd-privacy-allow">
        <Columns>
          <Columns.Column title="Request interception">
            <SettingItem
              input={
                <Group>
                  <Text>Use development bundles:</Text>
                  <SegmentedControl
                    color="violet"
                    value={useDevBundles || 'No'}
                    size="xs"
                    data={[
                      'No',
                      { value: 'cdn', label: 'On CDN setup' },
                      { value: 'npm', label: 'On NPM setup (experimental)' },
                    ]}
                    onChange={(value) =>
                      setSetting('useDevBundles', value === 'No' ? false : (value as DevBundlesOverride))
                    }
                  />
                  {devServerStatus === DevServerStatus.AVAILABLE ? (
                    <Badge color="green">Available</Badge>
                  ) : devServerStatus === DevServerStatus.CHECKING ? (
                    <Badge color="yellow">Checking...</Badge>
                  ) : (
                    <Badge color="red">Unavailable</Badge>
                  )}
                </Group>
              }
              description={
                <>
                  Overrides bundles with local development bundles served by the Browser SDK development server. To
                  start the development server, run <Code>yarn dev</Code> in the Browser SDK root folder.
                </>
              }
            />

            <SettingItem
              input={
                <Checkbox
                  label="Use RUM Slim"
                  checked={useRumSlim}
                  onChange={(e) => setSetting('useRumSlim', isChecked(e.target))}
                  color="violet"
                />
              }
              description={
                <>If the page is using the RUM CDN bundle, this bundle will be replaced by the RUM Slim CDN bundle.</>
              }
            />

            <SettingItem
              input={
                <Checkbox
                  label="Block intake requests"
                  checked={blockIntakeRequests}
                  onChange={(e) => setSetting('blockIntakeRequests', isChecked(e.target))}
                  color="violet"
                />
              }
              description={<>Block requests made to the intake, preventing any data to be sent to Datadog.</>}
            />
          </Columns.Column>

          <Columns.Column title="Events list">
            <SettingItem
              input={
                <Checkbox
                  label="Preserve events"
                  checked={preserveEvents}
                  onChange={(e) => setSetting('preserveEvents', isChecked(e.target))}
                  color="violet"
                />
              }
              description={<>Don't clear events when reloading the page or navigating away.</>}
            />

            <SettingItem
              input={
                <Group>
                  <Text>Event collection strategy:</Text>
                  <SegmentedControl
                    color="violet"
                    value={eventCollectionStrategy}
                    size="xs"
                    data={[
                      { label: 'SDK', value: 'sdk' },
                      { label: 'Requests', value: 'requests' },
                    ]}
                    onChange={(value) => setSetting('eventCollectionStrategy', value as EventCollectionStrategy)}
                  />
                </Group>
              }
              description={
                <>
                  {eventCollectionStrategy === 'requests' && (
                    <>
                      Collect events by listening to intake HTTP requests: events need to be flushed to be collected.
                      Any SDK setup is supported.
                    </>
                  )}
                  {eventCollectionStrategy === 'sdk' && (
                    <>
                      Collect events by listening to messages sent from the SDK: events are available as soon as they
                      happen. Only newer versions of the SDK are supported.
                    </>
                  )}
                </>
              }
            />

            <SettingItem
              input={
                <Checkbox
                  label="Auto Flush"
                  checked={autoFlush}
                  onChange={(e) => setSetting('autoFlush', isChecked(e.target))}
                  color="violet"
                />
              }
              description={<>Force the SDK to flush events periodically.</>}
            />
          </Columns.Column>
          <Columns.Column title="Other">
            <SettingItem
              input={
                <Checkbox
                  label="Debug mode"
                  checked={debug}
                  onChange={(e) => setSetting('debugMode', isChecked(e.target))}
                  color="violet"
                />
              }
              description={<>Enable the SDK logs in the developer console</>}
            />

            <SettingItem
              input={
                <Group className={classes.groupWithButton}>
                  <Checkbox
                    label="Override Organization & App"
                    checked={overrideOrgAndApp}
                    onChange={(e) => setSetting('overrideOrgAndApp', isChecked(e.target))}
                    color="violet"
                  />
                  {needsPageRefresh() && (
                    <Button onClick={reloadInPage} size="compact-xs" color="orange">
                      Click to refresh & apply the changes
                    </Button>
                  )}
                </Group>
              }
            />
            <SettingItem
              input={
                <Group>
                  <TextInput
                    label="ApplicationId"
                    onChange={(e) => setSetting('applicationId', e.target.value)}
                    value={applicationId as string}
                  />
                  <TextInput
                    label="clientToken"
                    onChange={(e) => setSetting('clientToken', e.target.value)}
                    value={clientToken as string}
                  />
                </Group>
              }
              description={
                <>
                  Override the application where data is being stored. You will need to reload the page to apply any
                  changes
                </>
              }
            />
          </Columns.Column>
        </Columns>
      </div>
    </TabBase>
  )
}

function SettingItem({ description, input }: { description?: React.ReactNode; input: React.ReactNode }) {
  return (
    <Box>
      {input}
      {description && <Text c="dimmed">{description}</Text>}
      <Space h="md" />
    </Box>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}
