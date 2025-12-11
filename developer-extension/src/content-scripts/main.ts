import type { Settings } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import {
  CDN_LOGS_URL,
  CDN_RUM_SLIM_URL,
  CDN_RUM_URL,
  DEV_LOGS_URL,
  DEV_RUM_SLIM_URL,
  DEV_RUM_URL,
} from '../common/packagesUrlConstants'
import { SESSION_STORAGE_SETTINGS_KEY } from '../common/sessionKeyConstant'
import { createLogger } from '../common/logger'

const logger = createLogger('main')

declare global {
  interface Window extends EventTarget {
    DD_RUM?: SdkPublicApi
    DD_LOGS?: SdkPublicApi
    __ddBrowserSdkExtensionCallback?: (message: unknown) => void
  }
}

interface SdkPublicApi {
  [key: string]: (...args: any[]) => unknown
}

export function main() {
  // Prevent multiple executions when the devetools are reconnecting
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
    const shouldInjectCdnBundles = settings.injectCdnProd === 'on'
    const shouldUseRedirect = settings.useDevBundles === 'npm'

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

    if (shouldInjectCdnBundles && shouldUseRedirect) {
      void injectCdnBundles({ useRumSlim: settings.useRumSlim }).then(() => {
        injectDevBundle(settings.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL, ddRumGlobal)
        injectDevBundle(DEV_LOGS_URL, ddLogsGlobal)
      })
    } else if (shouldInjectCdnBundles) {
      void injectCdnBundles({ useRumSlim: settings.useRumSlim })
    } else if (shouldUseRedirect) {
      injectDevBundle(settings.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL, ddRumGlobal, getDefaultRumConfig())
      injectDevBundle(DEV_LOGS_URL, ddLogsGlobal, getDefaultLogsConfig())
    }
  }
}

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

function injectDevBundle(url: string, global: GlobalInstrumentation, config?: object | null) {
  const existingInstance = global.get()

  let initConfig = config
  if (
    existingInstance &&
    'getInitConfiguration' in existingInstance &&
    typeof existingInstance.getInitConfiguration === 'function'
  ) {
    try {
      initConfig = existingInstance.getInitConfiguration() || config
    } catch {
      initConfig = config
    }
  }

  loadSdkScriptFromURL(url)
  const devInstance = global.get() as SdkPublicApi

  if (devInstance) {
    if (initConfig && 'init' in devInstance && typeof devInstance.init === 'function') {
      try {
        ;(devInstance as { init(config: object): void }).init(initConfig)
      } catch (error) {
        logger.error('[DD Browser SDK extension] Error initializing dev bundle:', error)
      }
    }

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
        originalInit({
          ...config,
          ...configurationOverride,
          allowedTrackingOrigins: [location.origin],
        })
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
    let sdkCode = xhr.responseText

    // Webpack expects the script to be loaded with a `<script src="...">` tag to get its URL to
    // know where to load the relative chunks. By loading it with an XHR and evaluating it in an
    // inline script tag, Webpack does not know where to load the chunks from.
    //
    // Let's replace Webpack logic that breaks with our own logic to define the URL. It's not
    // pretty, but loading the script this way isn't either, so...
    //
    // We'll probably have to revisit when using actual `import()` expressions instead of relying on
    // Webpack runtime to load the chunks.
    // Extract the base directory URL from the full file URL.
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)

    // Override webpack's scriptUrl detection in multiple places to ensure chunks load from dev server
    // 1. Replace the error throw with our base URL
    sdkCode = sdkCode.replace(
      'if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");',
      `if (!scriptUrl) scriptUrl = ${JSON.stringify(baseUrl)};`
    )

    // 2. Set scriptUrl early if it's determined from document.currentScript or similar
    sdkCode = sdkCode.replace(/var scriptUrl\s*=\s*[^;]+;/g, `var scriptUrl = ${JSON.stringify(baseUrl)};`)

    // 3. Override __webpack_require__.p (publicPath) if it exists
    sdkCode = sdkCode.replace(
      /__webpack_require__\.p\s*=\s*[^;]+;/g,
      `__webpack_require__.p = ${JSON.stringify(baseUrl)};`
    )

    // 4. Inject publicPath override at the start of the webpack runtime
    const publicPathOverride = `(function(){try{if(typeof __webpack_require__!=='undefined'){__webpack_require__.p=${JSON.stringify(baseUrl)};}}catch(e){}})();`
    sdkCode = publicPathOverride + sdkCode

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.text = sdkCode

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

function injectCdnBundles({ useRumSlim }: { useRumSlim: boolean }) {
  const rumUrl = useRumSlim ? CDN_RUM_SLIM_URL : CDN_RUM_URL
  const logsUrl = CDN_LOGS_URL

  return injectWhenDocumentReady(() =>
    Promise.all([
      injectAndInitializeSDK(rumUrl, 'DD_RUM', getDefaultRumConfig()),
      injectAndInitializeSDK(logsUrl, 'DD_LOGS', getDefaultLogsConfig()),
    ]).then(() => undefined)
  )
}

function injectWhenDocumentReady<T>(callback: () => Promise<T> | T) {
  if (document.readyState === 'loading') {
    return new Promise<T>((resolve) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          resolve(callback())
        },
        { once: true }
      )
    })
  }

  return Promise.resolve(callback())
}

function injectAndInitializeSDK(url: string, globalName: 'DD_RUM' | 'DD_LOGS', config: object | null) {
  if (window[globalName]) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      const sdkGlobal = window[globalName]
      if (config && sdkGlobal && 'init' in sdkGlobal) {
        try {
          ;(sdkGlobal as { init(config: object): void }).init(config)
        } catch (error) {
          // Ignore "already initialized" errors - this can happen when dev bundles override CDN bundles
          const errorMessage = error instanceof Error ? error.message : String(error)
          if (!errorMessage.includes('already initialized')) {
            // Only log non-initialization errors
            // eslint-disable-next-line no-console
            console.error(`[DD Browser SDK extension] Error initializing ${globalName}:`, error)
          }
        }
      }
      resolve()
    }
    script.onerror = () => {
      resolve()
    }

    try {
      document.head.appendChild(script)
    } catch {
      document.documentElement.appendChild(script)
    }
  })
}

function getDefaultRumConfig() {
  return {
    applicationId: 'xxx',
    clientToken: 'xxx',
    site: 'datadoghq.com',
    service: 'browser-sdk-extension',
    allowedTrackingOrigins: [location.origin],
    sessionReplaySampleRate: 100,
  }
}

function getDefaultLogsConfig() {
  return {
    clientToken: 'xxx',
    site: 'datadoghq.com',
    service: 'browser-sdk-extension',
    allowedTrackingOrigins: [location.origin],
  }
}
