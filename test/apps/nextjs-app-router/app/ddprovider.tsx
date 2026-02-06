'use client'

import { useEffect, type ReactNode } from 'react'
import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'

export function DatadogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const config = (window as any).RUM_CONFIGURATION
    if (!config) {
      return
    }

    datadogRum.init({
      ...config,
      plugins: [reactPlugin({ nextjs: true })],
    })
  }, [])

  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
