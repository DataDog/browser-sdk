import { Badge, Box, Checkbox, Code, Group, Space, Text, SegmentedControl } from '@mantine/core'
import React from 'react'
import { DevServerStatus, useDevServerStatus } from '../../hooks/useDevServerStatus'
import { useSettings } from '../../hooks/useSettings'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { DevBundlesOverride, EventCollectionStrategy } from '../../../common/extension.types'

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
