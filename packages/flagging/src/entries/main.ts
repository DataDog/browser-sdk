import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { createDatadogProvider } from '../openfeature/provider'

export { createDatadogProvider }

interface BrowserWindow extends Window {
  DD_FLAGGING?: typeof createDatadogProvider
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', createDatadogProvider)
