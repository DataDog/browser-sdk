import { Provider as BumbagProvider, Box, css } from 'bumbag'
import React, { Suspense } from 'react'

import { Panel } from './panel'

const theme = {
  global: {
    fontSize: 14,
    styles: {
      base: css`
        body {
          min-height: 100vh;
        }
      `,
    },
  },
  modes: {
    enableLocalStorage: false,
    useSystemColorMode: true,
  },
}

export function App() {
  return (
    <BumbagProvider theme={theme}>
      <Suspense fallback={<Box padding="major-4" />}>
        <Panel />
      </Suspense>
    </BumbagProvider>
  )
}
