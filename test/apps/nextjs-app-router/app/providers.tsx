'use client'

import type { ReactNode } from 'react'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin, DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'

// In E2E tests, RUM_CONFIGURATION is injected via Playwright's addInitScript
if (typeof window !== 'undefined') {
  const config = (window as any).RUM_CONFIGURATION
  if (config) {
    datadogRum.init({
      ...config,
      plugins: [reactPlugin({ nextjs: true }), ...(config.plugins || [])],
    })
  }
}

export function RumProvider({ children }: { children: ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
