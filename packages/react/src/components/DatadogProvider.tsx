import React from 'react'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { DatadogContext } from '../lib/datadogContext'

interface DatadogProviderProps {
  children?: React.ReactNode
  datadogBrowserSdk: RumPublicApi
}

export const DatadogProvider = ({ children, datadogBrowserSdk }: DatadogProviderProps) => {
  const stableContextValue = React.useMemo(() => ({ datadogBrowserSdk }), [datadogBrowserSdk])
  return <DatadogContext.Provider value={stableContextValue}>{children}</DatadogContext.Provider>
}
