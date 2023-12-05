import { Badge, Box, Checkbox, Code, Group, Select, Space, Text } from '@mantine/core'
import React from 'react'
import { DevServerStatus, useDevServerStatus } from '../../hooks/useDevServerStatus'
import { useSettings } from '../../hooks/useSettings'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { EventCollectionStrategy } from '../../../common/types'
import css from './settingsTab.module.css'

export function SettingsTab() {
  const devServerStatus = useDevServerStatus()
  const [
    {
      useDevBundles,
      injectDevBundles,
      useRumSlim,
      blockIntakeRequests,
      preserveEvents,
      eventCollectionStrategy,
      autoFlush,
    },
    setSetting,
  ] = useSettings()

  return (
    <TabBase>
      <div className="dd-privacy-allow">
        <Columns>
          <Columns.Column title="Request interception">
            <SettingItem
              input={
                <Group align="start">
                  <Checkbox
                    label="Use development bundles"
                    checked={useDevBundles}
                    onChange={(e) => setSetting('useDevBundles', isChecked(e.target))}
                    color="violet"
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
                  Overrides CDN bundles with local development bundles served by the Browser SDK development server. To
                  start the development server, run <Code>yarn dev</Code> in the Browser SDK root folder.
                </>
              }
            />

            <SettingItem
              input={
                <Group align="start">
                  <Checkbox
                    label="Inject development bundles"
                    checked={injectDevBundles}
                    onChange={(e) => setSetting('injectDevBundles', isChecked(e.target))}
                    color="violet"
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
                  Inject local development bundles to override NPM or other CDN SDK bundles. To start the development
                  server, run <Code>yarn dev</Code> in the Browser SDK root folder.
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
                  <Select
                    data={[
                      { label: 'Requests', value: 'requests' },
                      { label: 'SDK', value: 'sdk' },
                    ]}
                    value={eventCollectionStrategy}
                    onChange={(value) => setSetting('eventCollectionStrategy', value as EventCollectionStrategy)}
                    color="violet"
                    className={css.select}
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
