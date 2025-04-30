import { Badge, Box, Checkbox, Code, Group, Space, Switch, Text, SegmentedControl, Accordion } from '@mantine/core'
import React from 'react'
import { DEV_LOGS_URL, DEV_REPLAY_SANDBOX_URL } from '../../../common/packagesUrlConstants'
import { DevServerStatus, useDevServerStatus } from '../../hooks/useDevServerStatus'
import { useSettings } from '../../hooks/useSettings'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { DevBundlesOverride, EventCollectionStrategy } from '../../../common/extension.types'

export function SettingsTab() {
  const sdkDevServerStatus = useDevServerStatus(DEV_LOGS_URL)
  const replayDevServerStatus = useDevServerStatus(DEV_REPLAY_SANDBOX_URL)
  const [
    {
      useDevBundles,
      useDevReplaySandbox,
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
          <Columns.Column title="Overrides">
            <Accordion defaultValue="browser-sdk">
              <Accordion.Item key="browser-sdk" value="browser-sdk">
                <Accordion.Control>
                  <Group>
                    <Text>Browser SDK</Text>
                    <Box style={{ marginLeft: 'auto' }}>
                      {sdkDevServerStatus === DevServerStatus.AVAILABLE && useDevBundles ? (
                        <Badge color="blue">Overridden</Badge>
                      ) : sdkDevServerStatus === DevServerStatus.AVAILABLE ? (
                        <Badge color="green">Available</Badge>
                      ) : sdkDevServerStatus === DevServerStatus.CHECKING ? (
                        <Badge color="yellow">Checking...</Badge>
                      ) : (
                        <Badge color="red">Unavailable</Badge>
                      )}
                    </Box>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Box>
                    Use the local development version of the browser SDK. The development server must be running; to
                    start it, run <Code>yarn dev</Code>.
                  </Box>

                  <Space h="md" />

                  <SettingItem
                    input={
                      <Group>
                        <Text>Override strategy:</Text>
                        <SegmentedControl
                          color="violet"
                          value={useDevBundles || 'off'}
                          size="xs"
                          data={[
                            { value: 'off', label: 'Off' },
                            { value: 'cdn', label: 'Redirect' },
                            { value: 'npm', label: 'Inject' },
                          ]}
                          onChange={(value) =>
                            setSetting('useDevBundles', value === 'off' ? false : (value as DevBundlesOverride))
                          }
                        />
                      </Group>
                    }
                    description={
                      <>
                        Choose an override strategy. Network request redirection is reliable, but only works for CDN
                        setups. Injecting the bundle into the page can work for both CDN and NPM setups, but it's not
                        always reliable.
                      </>
                    }
                  />

                  <SettingItem
                    input={
                      <Group>
                        <Text>SDK variant:</Text>
                        <SegmentedControl
                          color="violet"
                          value={useRumSlim ? 'rum-slim' : 'rum'}
                          size="xs"
                          data={[
                            { value: 'rum', label: 'RUM' },
                            { value: 'rum-slim', label: 'RUM Slim' },
                          ]}
                          onChange={(value) => {
                            setSetting('useRumSlim', value === 'rum-slim')
                          }}
                        />
                      </Group>
                    }
                    description={<>Choose an SDK variant. Session replay features won't work with the slim version.</>}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item key="replay-sandbox" value="replay-sandbox">
                <Accordion.Control>
                  <Group>
                    <Text>Live replay</Text>
                    <Box style={{ marginLeft: 'auto' }}>
                      {replayDevServerStatus === DevServerStatus.AVAILABLE && useDevReplaySandbox ? (
                        <Badge color="blue">Overridden</Badge>
                      ) : replayDevServerStatus === DevServerStatus.AVAILABLE ? (
                        <Badge color="green">Available</Badge>
                      ) : replayDevServerStatus === DevServerStatus.CHECKING ? (
                        <Badge color="yellow">Checking...</Badge>
                      ) : (
                        <Badge color="red">Unavailable</Badge>
                      )}
                    </Box>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Box>
                    Use the Datadog-internal local development version of the live replay sandbox. The development
                    server must be running; to start it, run
                    <Code>yarn dev</Code>.
                  </Box>

                  <Space h="md" />

                  <SettingItem
                    input={
                      <Switch
                        label="Override the live replay sandbox"
                        checked={!!useDevReplaySandbox}
                        onChange={(event) => setSetting('useDevReplaySandbox', event.currentTarget.checked)}
                        color="violet"
                      />
                    }
                    description={<>Activate to use the local development version of the live replay sandbox.</>}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item key="intake-requests" value="intake-requests">
                <Accordion.Control>
                  <Group>
                    <Text>Intake requests</Text>
                    <Box style={{ marginLeft: 'auto' }}>
                      {blockIntakeRequests ? <Badge color="blue">Blocked</Badge> : <Badge color="green">Allowed</Badge>}
                    </Box>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <SettingItem
                    input={
                      <Switch
                        label="Block intake requests"
                        checked={blockIntakeRequests}
                        onChange={(event) => setSetting('blockIntakeRequests', event.currentTarget.checked)}
                        color="violet"
                      />
                    }
                    description={
                      <>Block requests made to the intake, preventing any data from being sent to Datadog.</>
                    }
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
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
