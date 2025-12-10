import type { Settings } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import { createLogger } from '../common/logger'
import {
  CDN_LOGS_URL,
  CDN_RUM_SLIM_URL,
  CDN_RUM_URL,
  DEV_LOGS_URL,
  DEV_RUM_SLIM_URL,
  DEV_RUM_URL,
} from '../common/packagesUrlConstants'
import { SESSION_STORAGE_SETTINGS_KEY } from '../common/sessionKeyConstant'

const logger = createLogger('content-script')

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

    const rumDevUrl = settings.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL

    if (settings.injectCdnProd === 'on' && settings.useDevBundles !== 'npm') {
      injectCdnBundle(settings)
    }

    if (settings.useDevBundles === 'npm') {
      runWhenDomReady(() => {
        const rumConfig = buildRumConfig(settings)
        const logsConfig = buildLogsConfig(settings)

        injectBundle(rumDevUrl, ddRumGlobal)
        injectBundle(DEV_LOGS_URL, ddLogsGlobal)

        initSdkIfAvailable(ddRumGlobal, rumConfig)
        initSdkIfAvailable(ddLogsGlobal, logsConfig)
      })
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

function injectCdnBundle(settings: Settings) {
  const injectWhenReady = () => {
    const rumUrl = settings.useRumSlim ? CDN_RUM_SLIM_URL : CDN_RUM_URL
    const rumConfig = buildRumConfig(settings)
    injectAndInitializeSDK(rumUrl, 'DD_RUM', rumConfig as any)

    const logsConfig = buildLogsConfig(settings)
    injectAndInitializeSDK(CDN_LOGS_URL, 'DD_LOGS', logsConfig as any)
  }
  runWhenDomReady(injectWhenReady)
}

function injectAndInitializeSDK(url: string, globalName: 'DD_RUM' | 'DD_LOGS', config: object | null) {
  const existingSdk = getSdkGlobal(globalName)

  if (existingSdk) {
    logger.log(`${globalName} already exists, skipping injection`)
    return
  }

  if (!url.includes('datadoghq-browser-agent.com')) {
    logger.log(`Skipping injection for ${globalName} (non-CDN url)`)
    return
  }

  const script = document.createElement('script')
  script.src = url
  script.async = true
  script.onload = () => {
    const sdk = getSdkGlobal(globalName)
    if (config && sdk && 'init' in sdk) {
      try {
        sdk.init(config as any)
      } catch (e) {
        logger.error(`Error initializing ${globalName}:`, e)
      }
    }
  }
  script.onerror = (e) => {
    logger.error(`Error loading ${globalName} script:`, e)
  }

  try {
    document.head.appendChild(script)
  } catch (appendErr) {
    logger.error('failed to append script to head, retrying on documentElement', appendErr)
    document.documentElement.appendChild(script)
  }
}

function injectBundle(url: string, global: GlobalInstrumentation) {
  loadSdkScriptFromURL(url)
  const injectedInstance = global.get() as SdkPublicApi

  if (injectedInstance) {
    // Keep a stable reference so subsequent injections reuse the latest loaded SDK.
    global.onSet((sdkInstance) => proxySdk(sdkInstance, injectedInstance))
    global.returnValue(injectedInstance)
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
    sdkCode = sdkCode.replace(
      'if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");',
      `if (!scriptUrl) scriptUrl = ${JSON.stringify(url)};`
    )

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

function getSdkGlobal(globalName: 'DD_RUM' | 'DD_LOGS') {
  return (window as any)[globalName] as SdkPublicApi | undefined
}

function buildRumConfig(settings: Settings) {
  return (
    settings.rumConfigurationOverride || {
      applicationId: 'xxx',
      clientToken: 'xxx',
      site: 'datadoghq.com',
      allowedTrackingOrigins: [location.origin],
      sessionReplaySampleRate: 100,
    }
  )
}

function buildLogsConfig(settings: Settings) {
  return (
    settings.logsConfigurationOverride || {
      clientToken: 'xxx',
      site: 'datadoghq.com',
      allowedTrackingOrigins: [location.origin],
    }
  )
}

function initSdkIfAvailable(global: GlobalInstrumentation, config: object) {
  const sdk = global.get()
  if (sdk && 'init' in sdk) {
    try {
      sdk.init(config)
    } catch (e) {
      logger.error('Error initializing SDK', e)
    }
  }
}

function runWhenDomReady(callback: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true })
  } else {
    callback()
  }
}
