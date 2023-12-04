import { EventListeners } from '../common/eventListeners'
import { DEV_LOGS_URL, DEV_RUM_URL, SESSION_STORAGE_SETTINGS_KEY } from '../common/constants'

declare global {
  interface Window extends EventTarget {
    DD_RUM?: SdkPublicApi
    DD_LOGS?: SdkPublicApi
    __ddBrowserSdkExtensionCallback?: (message: unknown) => void
  }
}

type SdkPublicApi = { [key: string]: (...args: any[]) => unknown }

function main() {
  if (window.__ddBrowserSdkExtensionCallback) {
    return
  }

  sendEventsToExtension()

  const stringSettings = sessionStorage.getItem(SESSION_STORAGE_SETTINGS_KEY)
  const settings = stringSettings && JSON.parse(stringSettings)

  if (settings) {
    const ddRumGlobal = instrumentGlobal('DD_RUM')
    const ddLogsGlobal = instrumentGlobal('DD_LOGS')

    if (settings.rumConfigurationOverride) {
      overrideInitConfiguration(ddRumGlobal, settings.rumConfigurationOverride)
    }

    if (settings.logsConfigurationOverride) {
      overrideInitConfiguration(ddLogsGlobal, settings.logsConfigurationOverride)
    }

    if (settings.injectDevBundles) {
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

function injectDevBundle(url: string, global: GlobalInstrumentation) {
  loadSdkScriptFromURL(url)
  const devInstance = global.get()

  if (devInstance) {
    global.onSet((sdkInstance) => proxySdk(sdkInstance, devInstance))
    global.returnValue(devInstance)
  }
}

function overrideInitConfiguration(global: GlobalInstrumentation, configurationOverride: object) {
  global.onSet((sdkInstance) => {
    const originalInit = sdkInstance.init
    sdkInstance.init = (config: any) => {
      originalInit({ ...config, ...configurationOverride })
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
  const eventListeners: EventListeners<SdkPublicApi> = new EventListeners<SdkPublicApi>()
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
  for (const key in root) {
    if (Object.prototype.hasOwnProperty.call(root, key)) {
      target[key] = root[key]
    }
  }
}
