'use client'

import type { ReactNode } from 'react'
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'
import { DatadogRumProvider } from '@datadog/browser-rum-nextjs/app-router'

if (typeof window !== 'undefined') {
  const config = (window as any).RUM_CONFIGURATION
  if (config) {
    datadogRum.init({
      ...config,
      plugins: [nextjsPlugin({ router: 'app' }), ...(config.plugins || [])],
    })
  }
}

export function RumProvider({ children }: { children: ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
