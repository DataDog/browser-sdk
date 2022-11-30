import { Alert, Button, Center, Group, MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React, { Suspense, useState } from 'react'
import { setOnDisconnect } from './actions'

import { Panel } from './panel'

export function App() {
  const colorScheme = useColorScheme()
  const [isDisconnected, setIsDisconnected] = useState(false)

  setOnDisconnect(() => setIsDisconnected(true))

  return (
    <MantineProvider
      theme={{
        colorScheme,
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
