'use client'

import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'

datadogRum.init({
  applicationId: 'a81f40b8-e9bd-4805-9b66-4e4edc529a14',
  clientToken: 'pubfe2e138a54296da76dd66f6b0b5f3d98',
  site: 'datad0g.com',
  service: 'nextjs-app-router-test',
  env: 'development',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: 'allow',
  plugins: [reactPlugin({ nextjs: true })],
})

export function DatadogProvider({ children }: { children: React.ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
