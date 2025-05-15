import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import { FlaggingPublicApi, makeFlaggingPublicApi } from '../boot/flaggingPublicApi'

export const datadogFlags = makeFlaggingPublicApi()

interface BrowserWindow extends Window {
  DD_FLAGS?: FlaggingPublicApi
}
defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_FLAGS', datadogFlags)
