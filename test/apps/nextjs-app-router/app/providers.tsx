'use client'

import { DatadogRumProvider } from '@datadog/browser-rum-nextjs'

export function Providers({ children }: { children: React.ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
