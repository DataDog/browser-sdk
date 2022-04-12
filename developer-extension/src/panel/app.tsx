import { MantineProvider } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React, { Suspense } from 'react'

import { Panel } from './panel'

export function App() {
  const colorScheme = useColorScheme()

  return (
    <MantineProvider
      theme={{
        colorScheme,
      }}
      withGlobalStyles
    >
      <Suspense fallback={<></>}>
        <Panel />
      </Suspense>
    </MantineProvider>
  )
}
