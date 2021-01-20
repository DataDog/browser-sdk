import { Provider as BumbagProvider, css, Box } from 'bumbag'
import React, { Suspense } from 'react'

import { Panel } from './Panel'

const theme = {
  global: {
    fontSize: 14,
    styles: {
      base: css`
        body {
          width: 300px;
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
