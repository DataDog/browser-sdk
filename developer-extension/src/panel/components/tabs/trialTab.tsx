import React from 'react'
import {
  Switch,
  Checkbox,
  MultiSelect,
  SegmentedControl,
  TextInput,
  NumberInput,
  Text,
  Space,
  Box,
  Group,
} from '@mantine/core'
import { useSettings } from '../../hooks/useSettings'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { Settings, SdkInjectionConfig } from '../../../common/extension.types'

export function TrialTab() {
  const [{ trialMode, sdkInjection }, setSetting] = useSettings()

  return (
    <TabBase>
      <Columns>
        <Columns.Column title="Trial Mode">
          <Text>After each change please reload the page.</Text>
          {trialMode && (
            <>
              <Space h="lg" />
              <Text size="lg" fw={600}>
                SDK Injection Configuration
              </Text>
              <Space h="md" />

              <SettingItem
                input={
                  <Switch
                    label="Enable SDK injection"
                    checked={sdkInjection.enabled}
                    onChange={(event) =>
                      setSetting('sdkInjection', { ...sdkInjection, enabled: event.currentTarget.checked })
                    }
                    color="violet"
                  />
                }
                description={<>Automatically inject the Datadog Browser SDK into pages that don't have it.</>}
              />

              <SettingItem
                input={
                  <Checkbox
                    label="Disable event intake (do not send data to Datadog)"
                    checked={sdkInjection.skipIntake}
                    onChange={(event) =>
                      setSetting('sdkInjection', { ...sdkInjection, skipIntake: event.currentTarget.checked })
                    }
                    color="violet"
                  />
                }
                description={
                  <>
                    When enabled, the SDK will drop all events before they are sent. Useful for local debugging without
                    a Datadog org.
                  </>
                }
              />

              {sdkInjection.enabled && (
                <>
                  <SettingItem
                    input={
                      <MultiSelect
                        label="SDK Types"
                        placeholder="Select SDK types to inject"
                        data={[
                          { value: 'rum', label: 'RUM' },
                          { value: 'logs', label: 'Logs' },
                        ]}
                        value={sdkInjection.sdkTypes}
                        onChange={(value) =>
                          setSetting('sdkInjection', { ...sdkInjection, sdkTypes: value as Array<'rum' | 'logs'> })
                        }
                      />
                    }
                    description={<>Choose which SDK types to inject.</>}
                  />

                  <SettingItem
                    input={
                      <Group>
                        <Text>RUM Bundle:</Text>
                        <SegmentedControl
                          color="violet"
                          value={sdkInjection.rumBundle}
                          size="xs"
                          data={[
                            { value: 'rum', label: 'RUM' },
                            { value: 'rum-slim', label: 'RUM Slim' },
                          ]}
                          onChange={(value) =>
                            setSetting('sdkInjection', { ...sdkInjection, rumBundle: value as 'rum' | 'rum-slim' })
                          }
                        />
                      </Group>
                    }
                    description={
                      <>Choose the RUM bundle variant. Session replay features won't work with the slim version.</>
                    }
                  />
                </>
              )}
            </>
          )}
        </Columns.Column>

        {trialMode && sdkInjection.enabled && sdkInjection.sdkTypes.includes('rum') && (
          <Columns.Column title="RUM Configuration">
            <RumConfigurationForm sdkInjection={sdkInjection} setSetting={setSetting} />
          </Columns.Column>
        )}

        {trialMode && sdkInjection.enabled && sdkInjection.sdkTypes.includes('logs') && (
          <Columns.Column title="Logs Configuration">
            <LogsConfigurationForm sdkInjection={sdkInjection} setSetting={setSetting} />
          </Columns.Column>
        )}
      </Columns>
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

function RumConfigurationForm({
  sdkInjection,
  setSetting,
}: {
  sdkInjection: SdkInjectionConfig
  setSetting: <Name extends keyof Settings>(name: Name, value: Settings[Name]) => void
}) {
  return (
    <>
      <SettingItem
        input={
          <TextInput
            label="Application ID"
            placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
            value={sdkInjection.rumConfig.applicationId}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, applicationId: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Your RUM application ID from Datadog.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Client Token"
            placeholder="pubXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            value={sdkInjection.rumConfig.clientToken}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, clientToken: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Your RUM client token from Datadog.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Site"
            placeholder="datadoghq.com"
            value={sdkInjection.rumConfig.site}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, site: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Your Datadog site (e.g., datadoghq.com, datadoghq.eu).</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Service"
            placeholder="my-service"
            value={sdkInjection.rumConfig.service}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, service: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Service name for the injected SDK.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Version"
            placeholder="1.0.0"
            value={sdkInjection.rumConfig.version}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, version: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Version of your application.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Environment"
            placeholder="dev"
            value={sdkInjection.rumConfig.env}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, env: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Environment (e.g., dev, staging, prod).</>}
      />

      <SettingItem
        input={
          <NumberInput
            label="Session Sample Rate"
            placeholder="100"
            value={sdkInjection.rumConfig.sessionSampleRate}
            min={0}
            max={100}
            onChange={(value) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: { ...sdkInjection.rumConfig, sessionSampleRate: typeof value === 'number' ? value : 100 },
              })
            }
          />
        }
        description={<>Percentage of sessions to track (0-100).</>}
      />

      <SettingItem
        input={
          <NumberInput
            label="Session Replay Sample Rate"
            placeholder="100"
            value={sdkInjection.rumConfig.sessionReplaySampleRate}
            min={0}
            max={100}
            onChange={(value) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                rumConfig: {
                  ...sdkInjection.rumConfig,
                  sessionReplaySampleRate: typeof value === 'number' ? value : 100,
                },
              })
            }
          />
        }
        description={<>Percentage of sessions that will be recorded for session replay (0-100).</>}
      />
    </>
  )
}

function LogsConfigurationForm({
  sdkInjection,
  setSetting,
}: {
  sdkInjection: SdkInjectionConfig
  setSetting: <Name extends keyof Settings>(name: Name, value: Settings[Name]) => void
}) {
  return (
    <>
      <SettingItem
        input={
          <TextInput
            label="Client Token"
            placeholder="pubXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            value={sdkInjection.logsConfig.clientToken}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                logsConfig: { ...sdkInjection.logsConfig, clientToken: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Your Logs client token from Datadog.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Site"
            placeholder="datadoghq.com"
            value={sdkInjection.logsConfig.site}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                logsConfig: { ...sdkInjection.logsConfig, site: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Your Datadog site (e.g., datadoghq.com, datadoghq.eu).</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Service"
            placeholder="my-service"
            value={sdkInjection.logsConfig.service}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                logsConfig: { ...sdkInjection.logsConfig, service: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Service name for the injected SDK.</>}
      />

      <SettingItem
        input={
          <TextInput
            label="Version"
            placeholder="1.0.0"
            value={sdkInjection.logsConfig.version}
            onChange={(event) =>
              setSetting('sdkInjection', {
                ...sdkInjection,
                logsConfig: { ...sdkInjection.logsConfig, version: event.currentTarget.value },
              })
            }
          />
        }
        description={<>Version of your application.</>}
      />
    </>
  )
}
