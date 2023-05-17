import { Button, MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import type { ReactNode } from 'react'
import React, { Suspense, useEffect, useState } from 'react'
import { isDisconnectError } from '../../common/isDisconnectError'
import { onBackgroundDisconnection } from '../backgroundScriptConnection'
import { Alert } from './alert'
import { Panel } from './panel'

export function App() {
  const colorScheme = useColorScheme()
  const [isDisconnected, setIsDisconnected] = useState(false)

  useEffect(() => {
    const subscription = onBackgroundDisconnection.subscribe(() => setIsDisconnected(true))
    return () => subscription.unsubscribe()
  }, [])

  return (
    <MantineProvider
      theme={{
        colorScheme,
        globalStyles: () => ({
          body: {
            margin: 0,
          },
        }),
      }}
      withGlobalStyles
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
