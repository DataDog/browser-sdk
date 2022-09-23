import { Anchor, Divider, Grid, Group, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'
import React from 'react'
import { useSdkInfos } from '../hooks/useSdkInfos'
import { Json } from './json'

export function InfosTab() {
  const infos = useSdkInfos()
  if (!infos) {
    return null
  }
  const sessionId = infos.cookie?.id

  return (
    <Grid>
      <Section name="Session">
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
            <Entry name="Created" value={formatDate(Number(infos.cookie.created))} />
            <Entry name="Expire" value={formatDate(Number(infos.cookie.expire))} />
          </>
        )}
      </Section>
      <Section name="RUM">
        {infos.rum && (
          <>
            {sessionId && (
              <Group>
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
                <Divider sx={{ height: '24px' }} orientation="vertical" />
                <AppLink config={infos.rum.config} path={`rum/replay/sessions/${sessionId}`} params={{}}>
                  Session Replay
                </AppLink>
              </Group>
            )}
            <Entry name="Version" value={infos.rum.version} />
            <Entry name="Configuration" value={infos.rum.config} />
            <Entry name="Internal context" value={infos.rum.internalContext} />
            <Entry name="Global context" value={infos.rum.globalContext} />
          </>
        )}
      </Section>
      <Section name="Logs">
        {infos.logs && (
          <>
            {sessionId && (
              <AppLink
                config={infos.logs.config}
                path="logs"
                params={{
                  query: `source:browser @session_id:${sessionId}`,
                }}
              >
                Explorer
              </AppLink>
            )}
            <Entry name="Version" value={infos.logs.version} />
            <Entry name="Configuration" value={infos.logs.config} />
            <Entry name="Global context" value={infos.logs.globalContext} />
          </>
        )}
      </Section>
    </Grid>
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

function Section({ name, children }: { name: string; children: ReactNode | undefined }) {
  return (
    <Grid.Col md={4} sm={12}>
      <Title order={3}>{name}</Title>
      {children || '(empty)'}
    </Grid.Col>
  )
}

function Entry({ name, value }: { name: string; value: any }) {
  return (
    <Text size="sm" component="div">
      {typeof value === 'string' ? (
        <>
          {name}: {value}
        </>
      ) : value ? (
        <>
          {name}: <Json name="" src={value} collapsed={1} />
        </>
      ) : (
        <>{name}: (empty)</>
      )}
    </Text>
  )
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-US')
}

function formatSessionType(value: string, ...labels: string[]) {
  const index = Number(value)
  return !isNaN(index) && index >= 0 && index < labels.length ? labels[index] : value
}
