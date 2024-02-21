import React from 'react'
import type { RumPublicApi } from '@datadog/browser-rum-core'
import { DatadogContext } from '../lib/datadogContext'

interface DatadogProviderProps {
  children?: React.ReactNode
  datadogReactRum: RumPublicApi
}

export const DatadogProvider = ({ children, datadogReactRum }: DatadogProviderProps) => {
  const stableContextValue = React.useMemo(() => ({ datadogReactRum }), [datadogReactRum])
  return <DatadogContext.Provider value={stableContextValue}>{children}</DatadogContext.Provider>
}
