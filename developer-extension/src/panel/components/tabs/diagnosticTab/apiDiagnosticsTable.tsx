import React from 'react'
import { Badge, Card, Flex, Text } from '@mantine/core'
import { Alert } from '../../alert'
import type { ApiDiagnostic, ApiDiagnosticLevel, ApiPathComponent } from '../../../hooks/useApiDiagnostics'
import { useApiDiagnostics } from '../../../hooks/useApiDiagnostics'

const DIAGNOSTIC_LEVEL_COLOR: { [level in ApiDiagnosticLevel]: string } = {
  error: 'red',
  info: 'teal',
  warning: 'orange',
}

export function ApiDiagnosticsTable() {
  const apiDiagnostics = useApiDiagnostics()

  switch (apiDiagnostics?.status) {
    case undefined:
      return <Flex></Flex>

    case 'error':
      return <Alert level="error" message="Failed to collect API diagnostics." />

    case 'success':
      return (
        <Flex direction="column" style={{ rowGap: '1em', paddingTop: '1em' }}>
          {apiDiagnostics.diagnostics.map((diagnostic) => (
            <ApiDiagnosticRow diagnostic={diagnostic} />
          ))}
        </Flex>
      )
  }
}

function ApiDiagnosticRow({ diagnostic }: { diagnostic: ApiDiagnostic }) {
  return (
    <Flex direction="row" style={{ columnGap: '5px' }}>
      <ApiDiagnosticBadge level={diagnostic.level} />
      <Card>
        <ApiDiagnosticDescription subject={diagnostic.subject} message={diagnostic.message} />
      </Card>
    </Flex>
  )
}

function ApiDiagnosticBadge({ level }: { level: ApiDiagnosticLevel }) {
  return (
    <Badge
      variant="outline"
      color={DIAGNOSTIC_LEVEL_COLOR[level]}
      style={{
        alignSelf: 'center',
        minWidth: '10em',
        marginRight: '1em',
      }}
    >
      {level}
    </Badge>
  )
}

function ApiDiagnosticDescription({ subject, message }: { subject: ApiPathComponent[]; message: string }) {
  // Drop the leading 'window' component unless it's interesting (e.g. because we're
  // talking about a getter or setter directly on the global object, or the global
  // object's prototype).
  const components =
    subject.length >= 2 && subject[0].name === 'window' && subject[1].type !== 'value' ? subject : subject.slice(1)

  // We can render the path in a compact way if only one component remains, or if
  // two remain, but the first one is a normal value property. In other situations,
  // we'll use an expanded rendering that takes up more space vertically but looks
  // better for complex paths and requires much less horizontal space.
  const useCompactPath = components.length === 1 || (components.length === 2 && components[0].type === 'value')

  return (
    <Flex direction="column">
      {useCompactPath ? (
        <ApiDiagnosticCompactPath components={components} />
      ) : (
        <ApiDiagnosticExpandedPath components={components} />
      )}
      <Text style={{ marginTop: '0.1em' }}>{message}</Text>
    </Flex>
  )
}

function ApiDiagnosticCompactPath({ components }: { components: ApiPathComponent[] }) {
  return <Text style={{ fontWeight: 'bold' }}>{components.map(formatPathComponentText).join('.')}</Text>
}

function ApiDiagnosticExpandedPath({ components }: { components: ApiPathComponent[] }) {
  return components.map((component, index) => <ApiDiagnosticPathComponent component={component} index={index} />)
}

function ApiDiagnosticPathComponent({ component, index }: { component: ApiPathComponent; index: number }) {
  const leadingDot = index === 0 ? '' : '.'
  const text = `${leadingDot}${formatPathComponentText(component)}`
  const marginLeft = index === 0 ? '0' : '1em'
  return <Text style={{ fontWeight: 'bold', marginLeft }}>{text}</Text>
}

function formatPathComponentText(component: ApiPathComponent): string {
  switch (component.type) {
    case 'prototype':
      return `__proto__ (${component.name})`
    case 'value':
      return `${component.name}`
    case 'get':
      return `${component.name} (get)`
    case 'set':
      return `${component.name} (set)`
  }
}
