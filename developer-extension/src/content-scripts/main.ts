import type { Settings } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import { CDN_BASE_URL, CDN_VERSION, DEV_LOGS_URL, DEV_RUM_SLIM_URL, DEV_RUM_URL } from '../common/packagesUrlConstants'
import { SESSION_STORAGE_SETTINGS_KEY } from '../common/sessionKeyConstant'
import { createLogger } from '../common/logger'

declare global {
  interface Window extends EventTarget {
    DD_RUM?: SdkPublicApi
    DD_LOGS?: SdkPublicApi
    __ddBrowserSdkExtensionCallback?: (message: unknown) => void
  }
}

const logger = createLogger('content-script-main')

interface SdkPublicApi {
  [key: string]: (...args: any[]) => unknown
}

function main() {
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

    if (settings.injectionVariant === 'local-dev' && settings.useDevBundles === 'npm') {
      injectDevBundle(settings.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL, ddRumGlobal)
      injectDevBundle(DEV_LOGS_URL, ddLogsGlobal)
    } else if (settings.injectionVariant === 'cdn') {
      injectCdnBundle(settings)
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
    logger.error(`Error while loading ${url}:`, error)
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

function injectCdnBundle(settings: Settings) {
  const injectWhenReady = () => {
    if (settings.sdkInjectionType === 'RUM' || settings.sdkInjectionType === 'BOTH') {
      const rumSite = (settings.rumConfigurationOverride as any)?.site as string | undefined
      const rumUrl = getRumBundleUrl(settings.useRumSlim ? 'rum-slim' : 'rum', rumSite)
      const rumConfig =
        settings.rumConfigurationOverride ||
        (settings.datadogMode
          ? {
              applicationId: 'xxx',
              clientToken: 'xxx',
              site: 'datad0g.com',
              allowedTrackingOrigins: [location.origin],
              sessionReplaySampleRate: 100,
            }
          : null)
      injectAndInitializeSDK(rumUrl, 'DD_RUM', rumConfig as any)
    }

    if (settings.sdkInjectionType === 'LOGS' || settings.sdkInjectionType === 'BOTH') {
      const logsSite = (settings.logsConfigurationOverride as any)?.site as string | undefined
      const logsUrl = getLogsBundleUrl(logsSite)
      const logsConfig =
        settings.logsConfigurationOverride ||
        (settings.datadogMode
          ? {
              clientToken: 'xxx',
              site: 'datad0g.com',
              allowedTrackingOrigins: [location.origin],
            }
          : null)
      injectAndInitializeSDK(logsUrl, 'DD_LOGS', logsConfig as any)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWhenReady, { once: true })
  } else {
    injectWhenReady()
  }
}

function getRumBundleUrl(bundle: 'rum' | 'rum-slim', site?: string): string {
  const region = getCdnRegion(site)
  return `${CDN_BASE_URL}/${region}/${CDN_VERSION}/datadog-${bundle}.js`
}

function getLogsBundleUrl(site?: string) {
  const region = getCdnRegion(site)
  return `${CDN_BASE_URL}/${region}/${CDN_VERSION}/datadog-logs.js`
}

function getCdnRegion(site?: string) {
  if (!site || site === 'datadoghq.com') {
    return 'us1'
  }
  if (site === 'datadoghq.eu') {
    return 'eu1'
  }
  if (site?.startsWith('us3.')) {
    return 'us3'
  }
  if (site?.startsWith('us5.')) {
    return 'us5'
  }
  if (site?.endsWith('datad0g.com')) {
    return 'us3'
  }

  return 'us1'
}

function injectAndInitializeSDK(url: string, globalName: 'DD_RUM' | 'DD_LOGS', config: object | null) {
  // If the SDK is already loaded, don't try to load it again
  if (window[globalName]) {
    logger.log(`${globalName} already exists, skipping injection`)
    return
  }

  if (url.includes('datadoghq-browser-agent.com')) {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      if (config && window[globalName] && 'init' in window[globalName]) {
        try {
          window[globalName].init(config)
        } catch (e) {
          logger.error(`Error initializing ${globalName}:`, e)
        }
      } else {
        logger.log(`${globalName} loaded. No init called (no config provided).`)
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
}
