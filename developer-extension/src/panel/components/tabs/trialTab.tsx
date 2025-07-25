import React, { useState } from 'react'
import { Switch, MultiSelect, SegmentedControl, JsonInput, Button, Text, Space, Box, Group } from '@mantine/core'
import { useSettings } from '../../hooks/useSettings'
import { Columns } from '../columns'
import { TabBase } from '../tabBase'
import type { Settings, SdkInjectionConfig } from '../../../common/extension.types'
import { Json } from '../json'

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

                  <SettingItem
                    input={
                      <Group>
                        <Text>Bundle Source:</Text>
                        <SegmentedControl
                          color="violet"
                          value={sdkInjection.bundleSource}
                          size="xs"
                          data={[
                            { value: 'dev', label: 'Dev' },
                            { value: 'cdn', label: 'CDN' },
                          ]}
                          onChange={(value) =>
                            setSetting('sdkInjection', { ...sdkInjection, bundleSource: value as 'dev' | 'cdn' })
                          }
                        />
                      </Group>
                    }
                    description={<>Select where to load SDK scripts from.</>}
                  />
                </>
              )}
              <Text>
                If you already have an SDK injected and the Infos tab does not reflect the same RUM as set in Trial,
                please go to the Infos tab and "End current session" and press "Clear" in configuration under RUM.
              </Text>
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

function ConfigEditor({ label, value, onChange }: { label: string; value: object; onChange: (value: object) => void }) {
  const [editing, setEditing] = useState(false)
  const [newValue, setNewValue] = useState(JSON.stringify(value, null, 2))

  const apply = () => {
    try {
      const parsed = JSON.parse(newValue)
      onChange(parsed)
      setEditing(false)
    } catch {
      // keep editing until valid JSON
    }
  }

  return (
    <SettingItem
      input={
        !editing ? (
          <>
            <Group align="center" gap="xs">
              <Text fw={500}>{label}</Text>
              <Button size="compact-xs" variant="light" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </Group>
            <Json value={value} />
          </>
        ) : (
          <>
            <JsonInput
              validationError="Invalid JSON"
              formatOnBlur
              autosize
              minRows={8}
              value={newValue}
              onChange={setNewValue}
            />
            <Group gap="xs" mt="xs">
              <Button size="compact-xs" variant="light" onClick={apply} className="dd-privacy-allow">
                Apply
              </Button>
              <Button size="compact-xs" variant="light" color="gray" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </Group>
          </>
        )
      }
    />
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
    <ConfigEditor
      label="RUM Configuration"
      value={sdkInjection.rumConfig}
      onChange={(value) => setSetting('sdkInjection', { ...sdkInjection, rumConfig: value as any })}
    />
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
    <ConfigEditor
      label="Logs Configuration"
      value={sdkInjection.logsConfig}
      onChange={(value) => setSetting('sdkInjection', { ...sdkInjection, logsConfig: value as any })}
    />
  )
}
