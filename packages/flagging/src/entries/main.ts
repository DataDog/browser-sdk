import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { DatadogProvider } from '../openfeature/provider'
import { offlinePrecomputedInit as offlineClientInit } from '../precomputeClient'

export { DatadogProvider, offlineClientInit }

interface BrowserWindow extends Window {
  DD_FLAGGING?: DatadogProvider
}

// CDN placeholder: provider without a precompute client returns defaults for
// all evaluations. Users must call offlineClientInit() to bootstrap real flags.
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', new DatadogProvider())
