import { Alert, Button, Center, Group, MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React, { Suspense, useState } from 'react'
import { listenDisconnectEvent } from './disconnectEvent'

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
    <Center
      sx={{
        height: '100vh',
      }}
    >
      <Alert title="Extension disconnected!" color="red">
        The extension has been disconnected. This can happen after an update.
        <Group position="right">
          <Button onClick={() => location.reload()} color="red">
            Reload extension
          </Button>
        </Group>
      </Alert>
    </Center>
  )
}
