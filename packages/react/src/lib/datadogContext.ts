import type { RumPublicApi } from '@datadog/browser-rum-core'
import React from 'react'

export const DatadogContext = React.createContext<{ datadogBrowserSdk?: RumPublicApi }>({
  datadogBrowserSdk: undefined,
})
