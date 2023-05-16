import { Button, MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React, { Suspense, useState } from 'react'
import { listenDisconnectEvent } from '../disconnectEvent'
import { Alert } from './alert'

import { Panel } from './panel'

export function App() {
  const colorScheme = useColorScheme()
  const [isDisconnected, setIsDisconnected] = useState(false)

  listenDisconnectEvent(() => setIsDisconnected(true))

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
      <Suspense fallback={<></>}>{isDisconnected ? <DisconnectAlert /> : <Panel />}</Suspense>
    </MantineProvider>
  )
}

function DisconnectAlert() {
  return (
    <Alert
      level="error"
      title="Extension disconnected!"
      message="The extension has been disconnected. This can happen after an update."
      button={
        <Button onClick={() => location.reload()} color="red">
          Reload extension
        </Button>
      }
    />
  )
}
