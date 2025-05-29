import { defineGlobal, getGlobalObject } from '@datadog/browser-core'

import { DatadogProvider } from '../openfeature/provider'

export { DatadogProvider }
export { configurationFromString, configurationToString } from '../configuration'

interface BrowserWindow extends Window {
  DD_FLAGGING?: DatadogProvider
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', new DatadogProvider())
