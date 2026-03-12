import { defineGlobal, getGlobalObject } from '@datadog/browser-core'
import {
  fetchRemoteConfiguration,
  buildEndpoint,
  resolveDynamicValues,
  browserContextItemHandler,
} from '../remoteConfiguration'

function resolveDynamicValuesForBrowser(
  configValue: unknown,
  options: {
    onCookie?: (value: string | undefined) => void
    onDom?: (value: string | null | undefined) => void
    onJs?: (value: unknown) => void
  } = {}
): unknown {
  return resolveDynamicValues(configValue, {
    ...options,
    contextItemHandler: browserContextItemHandler,
  })
}

const ddRemoteConfig = {
  fetchRemoteConfiguration,
  buildEndpoint,
  resolveDynamicValues: resolveDynamicValuesForBrowser,
}

interface BrowserWindow extends Window {
  DD_REMOTE_CONFIG?: typeof ddRemoteConfig
}

defineGlobal(getGlobalObject<BrowserWindow>(), 'DD_REMOTE_CONFIG', ddRemoteConfig)
