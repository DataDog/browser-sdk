import { ActionIcon, Anchor, Button, Divider, Group, JsonInput, Space, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import React, { useEffect, useState } from 'react'
import { evalInWindow } from '../../evalInWindow'
import { useSdkInfos } from '../../hooks/useSdkInfos'
import { Columns } from '../columns'
import { Json } from '../json'
import { TabBase } from '../tabBase'
import { createLogger } from '../../../common/logger'
import { formatDate } from '../../formatNumber'
import { useSettings } from '../../hooks/useSettings'

const logger = createLogger('infosTab')

export function InfosTab() {
  const infos = useSdkInfos()
  const [, setSetting] = useSettings()

  if (!infos) {
    return null
  }

  const sessionId = infos.cookie?.id

  return (
    <TabBase>
      <Columns>
        <Columns.Column title="Session">
          {infos.cookie && (
            <>
              <Entry name="Id" value={infos.cookie.id} />
              <Entry name="Logs" value={formatSessionType(infos.cookie.logs, 'Not tracked', 'Tracked')} />
              <Entry
                name="RUM"
                value={formatSessionType(
                  infos.cookie.rum,
                  'Not tracked',
                  'Tracked with Session Replay',
                  'Tracked without Session Replay'
                )}
              />
              {infos.cookie.created && <Entry name="Created" value={formatDate(Number(infos.cookie.created))} />}
              <Entry name="Expire" value={formatDate(Number(infos.cookie.expire))} />
              <Space h="sm" />
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

function Entry({ name, value, onChange }: { name: string; value: any; onChange?: (value: object | null) => void }) {
  const [edited, setEdited] = useState(false)
  const [newValue, setNewValue] = React.useState<string | null>()

  useEffect(() => {
    setNewValue(serializeJson(value))
  }, [value])

  const handleApplyClick = () => {
    const valueJson = newValue ? tryParseJson(newValue) : null
    if (onChange && valueJson !== false) {
      onChange(valueJson)
      setEdited(false)
      reloadPage()
    }
  }

  return (
    <Text component="div">
      {typeof value === 'string' ? (
        <>
          {name}: {value}
        </>
      ) : value ? (
        <>
          {name}
          {onChange && (
            <>
              {!edited ? (
                <ActionIcon
                  style={{ display: 'inline-block' }}
                  color="violet"
                  size="xs"
                  variant="transparent"
                  aria-label="Edit"
                  onClick={() => setEdited(true)}
                >
                  ✏️
                </ActionIcon>
              ) : (
                <Button
                  color="violet"
                  variant="transparent"
                  size="compact-xs"
                  onClick={handleApplyClick}
                  className="dd-privacy-allow"
                >
                  Apply
                </Button>
              )}
            </>
          )}
          :
          {!edited ? (
            <Json value={value} />
          ) : (
            <JsonInput
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
        <>{name}: (empty)</>
      )}
    </Text>
  )
}

function formatSessionType(value: string, ...labels: string[]) {
  const index = Number(value)
  return !isNaN(index) && index >= 0 && index < labels.length ? labels[index] : value
}

function endSession() {
  evalInWindow(
    `
      document.cookie = '_dd_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
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
  // replacer to remove function attributes that have been serialized as empty object by useSdkInfos() (ex: beforeSend)
  const replacer = (key: string, val: unknown) => (key !== '' && typeof val === 'object' ? undefined : val)
  return JSON.stringify(value, replacer, 2)
}
