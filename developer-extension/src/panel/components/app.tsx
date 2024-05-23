import { Button, MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'
import React, { Suspense, useEffect, useState } from 'react'
import { isDisconnectError } from '../../common/isDisconnectError'
import { onBackgroundDisconnection } from '../backgroundScriptConnection'
import { Alert } from './alert'
import { Panel } from './panel'

export function App() {
  const [isDisconnected, setIsDisconnected] = useState(false)

  useEffect(() => {
    const subscription = onBackgroundDisconnection.subscribe(() => setIsDisconnected(true))
    return () => subscription.unsubscribe()
  }, [])

  return (
    <MantineProvider
      defaultColorScheme="auto"
      theme={{
        // This is the default for devtools on mac
        // https://github.com/ChromeDevTools/devtools-frontend/blob/92b3004cf9190eeb98a721ecb8c3931b45609031/front_end/ui/legacy/inspectorCommon.css#L86
        // TODO: adjust for other OS
        fontFamily: '".SFNSDisplay-Regular", "Helvetica Neue", "Lucida Grande", sans-serif',
        fontFamilyMonospace: 'menlo, monospace',
        fontSizes: {
          xs: '11px',

          // Mantine uses the 'md' font size as a default, but some of its components is using 'sm'.
          // We want all font size to default to the same size, so let's use the same value for 'sm'
          // and 'md'.
          sm: '12px',
          md: '12px',

          lg: '16px',
          xl: '22px',
        },
        cursorType: 'pointer',
      }}
    >
      <ErrorBoundary>
        <Suspense fallback={<></>}>{isDisconnected ? <DisconnectAlert /> : <Panel />}</Suspense>
      </ErrorBoundary>
    </MantineProvider>
  )
}

function DisconnectAlert() {
  return (
    <Alert
      level="error"
      title="Extension disconnected!"
      message="The extension has been disconnected. This can happen after an update."
      button={<ReloadButton />}
    />
  )
}

function ReloadButton() {
  return <Button onClick={() => location.reload()}>Reload extension</Button>
}

class ErrorBoundary extends React.Component<{ children: ReactNode }, { error?: unknown }> {
  state = {}

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if ('error' in this.state) {
      const error = this.state.error

      if (isDisconnectError(error)) {
        return <DisconnectAlert />
      }

      return (
        <Alert
          level="error"
          title="Extension crashed!"
          message={error instanceof Error ? String(error) : `Error: ${String(error)}`}
          button={<ReloadButton />}
        />
      )
    }

    return this.props.children
  }
}
