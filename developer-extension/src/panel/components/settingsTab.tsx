import { Badge, Box, Button, Checkbox, Code, Group, Space, Text } from '@mantine/core'
import React from 'react'
import { evalInWindow } from '../evalInWindow'
import { Columns } from './columns'
import { TabBase } from './tabBase'

export interface Settings {
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
  autoFlush: boolean
  preserveEvents: boolean
}

export function SettingsTab({
  settings: { useDevBundles, useRumSlim, blockIntakeRequests, preserveEvents, autoFlush },
  setSettings,
  devServerStatus,
}: {
  settings: Settings
  setSettings: (newSettings: Partial<Settings>) => void
  devServerStatus: string
}) {
  return (
    <TabBase>
      <Columns>
        <Columns.Column title="Request interception">
          <SettingItem
            input={
              <Group align="start">
                <Checkbox
                  label="Use development bundles"
                  checked={useDevBundles}
                  onChange={(e) => setSettings({ useDevBundles: isChecked(e.target) })}
                  color="violet"
                />
                {devServerStatus === 'available' ? (
                  <Badge color="green">Available</Badge>
                ) : devServerStatus === 'checking' ? (
                  <Badge color="yellow">Checking...</Badge>
                ) : (
                  <Badge color="red">Unavailable</Badge>
                )}
              </Group>
            }
            description={
              <>
                Use the local development bundles served by the Browser SDK development server. To start the development
                server, run <Code>yarn dev</Code> in the Browser SDK root folder.
              </>
            }
          />

          <SettingItem
            input={
              <Checkbox
                label="Use RUM Slim"
                checked={useRumSlim}
                onChange={(e) => setSettings({ useRumSlim: isChecked(e.target) })}
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
                onChange={(e) => setSettings({ blockIntakeRequests: isChecked(e.target) })}
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
                onChange={(e) => setSettings({ preserveEvents: isChecked(e.target) })}
                color="violet"
              />
            }
            description={<>Don't clear events when reloading the page or navigating away.</>}
          />

          <SettingItem
            input={
              <Checkbox
                label="Auto Flush"
                checked={autoFlush}
                onChange={(e) => setSettings({ autoFlush: isChecked(e.target) })}
                color="violet"
              />
            }
            description={<>Force the SDK to flush events periodically.</>}
          />
        </Columns.Column>

        <Columns.Column title="Misc">
          <Button color="violet" variant="light" onClick={() => endSession()}>
            End current session
          </Button>
        </Columns.Column>
      </Columns>
    </TabBase>
  )
}

function SettingItem({ description, input }: { description?: React.ReactNode; input: React.ReactNode }) {
  return (
    <Box>
      {input}
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      <Space h="md" />
    </Box>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}

function endSession() {
  evalInWindow(
    `
      document.cookie = '_dd_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    `
  ).catch((error) => console.error('Error while ending session:', error))
}
