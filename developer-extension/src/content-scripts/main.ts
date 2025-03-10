import type { Settings } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import { DEV_LOGS_URL, DEV_RUM_URL } from '../common/packagesUrlConstants'
import { SESSION_STORAGE_SETTINGS_KEY } from '../common/sessionKeyConstant'

declare global {
  interface Window extends EventTarget {
    DD_RUM?: SdkPublicApi
    DD_LOGS?: SdkPublicApi
    __ddBrowserSdkExtensionCallback?: (message: unknown) => void
  }
}

type SdkPublicApi = { [key: string]: (...args: any[]) => unknown }

function main() {
  // Prevent multiple executions when the devtools are reconnecting
  if (window.__ddBrowserSdkExtensionCallback) {
    return
  }

  sendEventsToExtension()

  const settings = getSettings()

  if (
    settings &&
    // Avoid instrumenting SDK global variables if the SDKs are already loaded.
    // This happens when the page is loaded and then the devtools are opened.
    noBrowserSdkLoaded()
  ) {
    const ddRumGlobal = instrumentGlobal('DD_RUM')
    const ddLogsGlobal = instrumentGlobal('DD_LOGS')

    if (settings.debugMode) {
      setDebug(ddRumGlobal)
      setDebug(ddLogsGlobal)
    }

    if (settings.rumConfigurationOverride) {
      overrideInitConfiguration(ddRumGlobal, settings.rumConfigurationOverride)
    }

    if (settings.logsConfigurationOverride) {
      overrideInitConfiguration(ddLogsGlobal, settings.logsConfigurationOverride)
    }

    if (settings.useDevBundles === 'npm') {
      injectDevBundle(DEV_RUM_URL, ddRumGlobal)
      injectDevBundle(DEV_LOGS_URL, ddLogsGlobal)
    }
  }
}

main()

function sendEventsToExtension() {
  // This script is executed in the "main" execution world, the same world as the webpage. Thus, it
  // can define a global callback variable to listen to SDK events.
  window.__ddBrowserSdkExtensionCallback = (message: unknown) => {
    // Relays any message to the "isolated" content-script via a custom event.
    window.dispatchEvent(
      new CustomEvent('__ddBrowserSdkMessage', {
        detail: message,
      })
    )
  }
}

function getSettings() {
  try {
    // sessionStorage access throws in sandboxed iframes
    const stringSettings = sessionStorage.getItem(SESSION_STORAGE_SETTINGS_KEY)
    // JSON.parse throws if the stringSettings is not a valid JSON
    return JSON.parse(stringSettings || 'null') as Settings | null
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error getting settings', error)
  }
}

function noBrowserSdkLoaded() {
  return !window.DD_RUM && !window.DD_LOGS
}

function injectDevBundle(url: string, global: GlobalInstrumentation) {
  loadSdkScriptFromURL(url)
  const devInstance = global.get() as SdkPublicApi

  if (devInstance) {
    global.onSet((sdkInstance) => proxySdk(sdkInstance, devInstance))
    global.returnValue(devInstance)
  }
}

function setDebug(global: GlobalInstrumentation) {
  global.onSet((sdkInstance) => {
    // Ensure the sdkInstance has a '_setDebug' method, excluding async stubs.
    if ('_setDebug' in sdkInstance) {
      sdkInstance._setDebug(true)
    }
  })
}

function overrideInitConfiguration(global: GlobalInstrumentation, configurationOverride: object) {
  global.onSet((sdkInstance) => {
    // Ensure the sdkInstance has an 'init' method, excluding async stubs.
    if ('init' in sdkInstance) {
      const originalInit = sdkInstance.init
      sdkInstance.init = (config: any) => {
        originalInit({ ...config, ...configurationOverride })
      }
    }
  })
}

function loadSdkScriptFromURL(url: string) {
  const xhr = new XMLHttpRequest()
  try {
    xhr.open('GET', url, false) // `false` makes the request synchronous
    xhr.send()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[DD Browser SDK extension] Error while loading ${url}:`, error)
    return
  }
  if (xhr.status === 200) {
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.text = xhr.responseText

    document.documentElement.prepend(script)
  }
}

type GlobalInstrumentation = ReturnType<typeof instrumentGlobal>
function instrumentGlobal(global: 'DD_RUM' | 'DD_LOGS') {
  const eventListeners = new EventListeners<SdkPublicApi>()
  let returnedInstance: SdkPublicApi | undefined
  let lastInstance: SdkPublicApi | undefined
  Object.defineProperty(window, global, {
    set(sdkInstance: SdkPublicApi) {
      eventListeners.notify(sdkInstance)
      lastInstance = sdkInstance
    },
    get(): SdkPublicApi | undefined {
      return returnedInstance ?? lastInstance
    },
  })

  return {
    get: () => window[global],
    onSet: (callback: (sdkInstance: SdkPublicApi) => void) => {
      eventListeners.subscribe(callback)
    },
    returnValue: (sdkInstance: SdkPublicApi) => {
      returnedInstance = sdkInstance
    },
  }
}

function proxySdk(target: SdkPublicApi, root: SdkPublicApi) {
  Object.assign(target, root)
}
