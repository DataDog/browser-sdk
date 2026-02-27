import { Anchor, Button, Divider, Group, JsonInput, Space, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import React, { useState } from 'react'
import { evalInWindow } from '../../evalInWindow'
import { useSdkInfos } from '../../hooks/useSdkInfos'
import { computeLogsTrackingType, computeRumTrackingType } from '../../sampler'
import { Columns } from '../columns'
import type { JsonValueDescriptor } from '../json'
import { Json } from '../json'
import { TabBase } from '../tabBase'
import { createLogger } from '../../../common/logger'
import { formatDate } from '../../formatNumber'
import { useSettings } from '../../hooks/useSettings'

const logger = createLogger('infosTab')

function buildLogExpression(descriptor: JsonValueDescriptor, sdkType: 'rum' | 'logs'): string {
  const evaluationPath = descriptor.evaluationPath
  const sdkGlobal = sdkType === 'rum' ? 'DD_RUM' : 'DD_LOGS'
  const sdkName = sdkType === 'rum' ? 'RUM' : 'Logs'

  return `
    (function() {
      const config = window.${sdkGlobal}?.getInitConfiguration?.();
      if (!config) {
        console.warn('[${sdkName}] SDK not found');
        return;
      }
      
      // Navigate the path to get the value
      let value = config;
      const pathParts = '${evaluationPath}'.split('.');
      
      for (const key of pathParts) {
        if (!value || typeof value !== 'object') {
          console.warn('[${sdkName}] Property not found at path: ${evaluationPath}');
          return;
        }
        
        // Handle array indices (numeric keys)
        if (Array.isArray(value)) {
          const index = parseInt(key, 10);
          if (isNaN(index) || index < 0 || index >= value.length) {
            console.warn('[${sdkName}] Invalid array index at path: ${evaluationPath}');
            return;
          }
          value = value[index];
        } else {
          if (!(key in value)) {
            console.warn('[${sdkName}] Property not found at path: ${evaluationPath}');
            return;
          }
          value = value[key];
        }
      }
      
      console.log('[${sdkName}] ${evaluationPath}:', value);
    })()
  `
}

function createRevealFunctionLocation(sdkType: 'rum' | 'logs') {
  return (descriptor: JsonValueDescriptor) => {
    const logExpression = buildLogExpression(descriptor, sdkType)

    evalInWindow(logExpression).catch((error) => {
      logger.error('Failed to log function:', error)
    })
  }
}

export function InfosTab() {
  const infos = useSdkInfos()
  const [settings, setSetting] = useSettings()

  if (!infos) {
    return null
  }

  const sessionId = infos.cookie?.id

  const logsTrackingType =
    infos.cookie?.logs ?? (sessionId && infos.logs?.config && computeLogsTrackingType(sessionId, infos.logs.config))

  const rumTrackingType =
    infos.cookie?.rum ?? (sessionId && infos.rum?.config && computeRumTrackingType(sessionId, infos.rum.config))

  return (
    <TabBase>
      <Columns>
        <Columns.Column title="Session">
          {infos.cookie && (
            <>
              <Entry name="Id" value={infos.cookie.id} />
              <Entry
                name="Logs"
                value={logsTrackingType && formatSessionType(logsTrackingType, 'Not tracked', 'Tracked')}
              />
              <Entry
                name="RUM"
                value={
                  rumTrackingType &&
                  formatSessionType(
                    rumTrackingType,
                    'Not tracked',
                    'Tracked with Session Replay',
                    'Tracked without Session Replay'
                  )
                }
              />
              {infos.cookie.forcedReplay && <Entry name="Is Replay Forced" value={'True'} />}
              <Entry name="Created" value={infos.cookie.created && formatDate(Number(infos.cookie.created))} />
              <Entry name="Expire" value={infos.cookie.expire && formatDate(Number(infos.cookie.expire))} />
              <Button color="violet" variant="light" onClick={endSession} className="dd-privacy-allow">
                End current session
              </Button>
            </>
          )}
        </Columns.Column>
        <Columns.Column title="RUM">
          {infos.rum && (
            <>
              {sessionId && (
                <Group className="dd-privacy-allow">
                  <AppLink
                    config={infos.rum.config}
                    path="rum/explorer"
                    params={{
                      query: `@session.id:${sessionId}`,
                      live: 'true',
                    }}
                  >
                    Explorer
                  </AppLink>
                  <Divider orientation="vertical" />
                  <AppLink config={infos.rum.config} path={`rum/replay/sessions/${sessionId}`} params={{}}>
                    Session Replay
                  </AppLink>
                </Group>
              )}
              <Entry name="Version" value={infos.rum.version} />
              <Entry
                name="Configuration"
                value={infos.rum.config}
                onChange={(value) => {
                  setSetting('rumConfigurationOverride', value)
                }}
                isOverridden={!!settings.rumConfigurationOverride}
                onRevealFunctionLocation={createRevealFunctionLocation('rum')}
              />
              <Entry name="Internal context" value={infos.rum.internalContext} />
              <Entry name="Global context" value={infos.rum.globalContext} />
              <Entry name="User" value={infos.rum.user} />
            </>
          )}
        </Columns.Column>
        <Columns.Column title="Logs">
          {infos.logs && (
            <>
              {sessionId && (
                <div className="dd-privacy-allow">
                  <AppLink
                    config={infos.logs.config}
                    path="logs"
                    params={{
                      query: `source:browser @session_id:${sessionId}`,
                    }}
                  >
                    Explorer
                  </AppLink>
                </div>
              )}
              <Entry name="Version" value={infos.logs.version} />
              <Entry
                name="Configuration"
                value={infos.logs.config}
                onChange={(value) => {
                  setSetting('logsConfigurationOverride', value)
                }}
                isOverridden={!!settings.logsConfigurationOverride}
                onRevealFunctionLocation={createRevealFunctionLocation('logs')}
              />
              <Entry name="Global context" value={infos.logs.globalContext} />
              <Entry name="User" value={infos.logs.user} />
            </>
          )}
        </Columns.Column>
      </Columns>
    </TabBase>
  )
}

function AppLink({
  config,
  path,
  params,
  children,
}: {
  config?: { site?: string }
  path: string
  params: { [key: string]: string }
  children: ReactNode
}) {
  const site = config?.site ?? 'datadoghq.com'
  const hostname = site === 'datadoghq.com' ? 'app.datadoghq.com' : site === 'datad0g.com' ? 'dd.datad0g.com' : site
  return (
    <Anchor href={`https://${hostname}/${path}?${new URLSearchParams(params).toString()}`} target="_blank">
      {children}
    </Anchor>
  )
}

function Entry({
  name,
  value,
  isOverridden = false,
  onChange,
  onRevealFunctionLocation,
}: {
  name: string
  value: any
  isOverridden?: boolean
  onChange?: (value: object | null) => void
  onRevealFunctionLocation?: (descriptor: JsonValueDescriptor) => void
}) {
  const [edited, setEdited] = useState(false)
  const [newValue, setNewValue] = React.useState<string | null>()

  const handleApplyClick = () => {
    const valueJson = newValue ? tryParseJson(newValue) : null
    if (onChange && valueJson !== false) {
      onChange(valueJson)
      setEdited(false)
      reloadPage()
    }
  }

  const handleClearClick = () => {
    onChange?.(null)
    reloadPage()
  }

  const handleEditClick = () => {
    setEdited(true)
    setNewValue(serializeJson(value))
  }
  return (
    <Text component="div">
      {typeof value === 'string' ? (
        <>
          <EntryName>{name}: </EntryName> {value}
        </>
      ) : value ? (
        <>
          <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
            <EntryName>{name}: </EntryName>
            {onChange && (
              <>
                {!edited ? (
                  <>
                    <Button variant="light" size="compact-xs" onClick={handleEditClick}>
                      Edit
                    </Button>
                    {isOverridden && (
                      <Button variant="light" size="compact-xs" onClick={handleClearClick}>
                        Clear
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button variant="light" size="compact-xs" onClick={handleApplyClick} className="dd-privacy-allow">
                      Apply
                    </Button>
                    <Button
                      variant="light"
                      size="compact-xs"
                      color="gray"
                      onClick={() => setEdited(false)}
                      className="dd-privacy-allow"
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
          {!edited ? (
            <Json value={value} onRevealFunctionLocation={onRevealFunctionLocation} />
          ) : (
            <JsonInput
              style={{ marginTop: '5px' }}
              validationError="Invalid JSON"
              formatOnBlur
              autosize
              minRows={4}
              value={newValue ?? ''}
              onChange={setNewValue}
              serialize={serializeJson}
            />
          )}
        </>
      ) : (
        <>
          <EntryName>{name}: </EntryName>(empty)
        </>
      )}
      <Space h="xs" />
    </Text>
  )
}

function EntryName({ children }: { children: ReactNode }) {
  return (
    <Text component="span" size="md" fw={500}>
      {children}
    </Text>
  )
}

function formatSessionType(value: string, ...labels: string[]) {
  const index = Number(value)
  return !isNaN(index) && index >= 0 && index < labels.length ? labels[index] : value
}

function endSession() {
  const fourHours = 1000 * 60 * 60 * 4
  const expires = new Date(Date.now() + fourHours).toUTCString()

  evalInWindow(
    `
      document.cookie = '_dd_s=isExpired=1; expires=${expires}; path=/'
    `
  ).catch((error) => logger.error('Error while ending session:', error))
}

function reloadPage() {
  evalInWindow('window.location.reload()').catch((error) => logger.error('Error while reloading the page:', error))
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as { [key: string]: any }
  } catch {
    return false
  }
}

function serializeJson(value: object) {
  // replacer to remove function attributes that have been serialized with metadata by useSdkInfos() (ex: beforeSend)
  const replacer = (key: string, val: unknown) => {
    // Filter out function metadata objects
    if (key !== '' && !Array.isArray(val) && typeof val === 'object' && val && (val as any).__type === 'function') {
      return undefined
    }
    return val
  }

  return JSON.stringify(value, replacer, 2)
}
