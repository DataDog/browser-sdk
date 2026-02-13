'use client'

import type { ReactNode } from 'react'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin, DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'

// In E2E tests, RUM_CONFIGURATION is injected via Playwright's addInitScript
// if (typeof window !== 'undefined') {
//   const config = (window as any).RUM_CONFIGURATION
//   if (config) {
//     datadogRum.init({
//       ...config,
//       plugins: [reactPlugin({ nextjs: true }), ...(config.plugins || [])],
//     })
//   }
// }

datadogRum.init({
  applicationId: 'a81f40b8-e9bd-4805-9b66-4e4edc529a14',
  clientToken: 'pubfe2e138a54296da76dd66f6b0b5f3d98',
  site: 'datad0g.com',
  service: "beltran's-app",
  env: 'dev',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackBfcacheViews: true,
  defaultPrivacyLevel: 'mask-user-input',
  plugins: [reactPlugin({ nextjs: true })],
})

export function RumProvider({ children }: { children: ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
