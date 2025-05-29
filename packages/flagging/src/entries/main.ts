import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import './polyfill'

import { DatadogProvider } from '../openfeature/provider'

export { configurationFromString, configurationToString } from '../configuration'
export { DatadogProvider }

interface BrowserWindow extends Window {
  DD_FLAGGING?: {
    Provider: typeof DatadogProvider
  }
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', { Provider: DatadogProvider })
