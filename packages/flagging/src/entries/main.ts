import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { DatadogProvider } from '../openfeature/provider'
import { offlinePrecomputedInit as offlineClientInit } from '../precomputeClient'

export { DatadogProvider, offlineClientInit }

interface BrowserWindow extends Window {
  DD_FLAGGING?: DatadogProvider
}

defineGlobal(
  getGlobalObject<BrowserWindow>(),
  'DD_FLAGGING',
  new DatadogProvider(offlineClientInit({ precomputedConfiguration: '' }) ?? undefined)
)
