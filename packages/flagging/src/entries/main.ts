import { defineGlobal, getGlobalObject } from '@datadog/browser-core'

// Apply globalThis polyfill before importing OpenFeature
// The OpenFeature web SDK uses globalThis which is not available in older browsers (like Chrome 63).
// Our getGlobalObject() utility provides a polyfill that makes globalThis available by using
// fallbacks like window or self. We need to call it before importing OpenFeature to ensure
// the polyfill is in place when OpenFeature tries to use globalThis.
getGlobalObject()

import { DatadogProvider } from '../openfeature/provider'

export { configurationFromString, configurationToString } from '../configuration'
export { DatadogProvider }

interface BrowserWindow extends Window {
  DD_FLAGGING?: {
    Provider: typeof DatadogProvider
  }
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGGING', { Provider: DatadogProvider })
