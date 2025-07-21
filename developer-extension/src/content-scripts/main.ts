import type { Settings } from '../common/extension.types'
import { EventListeners } from '../common/eventListeners'
import { DEV_LOGS_URL, DEV_RUM_SLIM_URL, DEV_RUM_URL, CDN_BASE_URL, CDN_VERSION } from '../common/packagesUrlConstants'
import { SESSION_STORAGE_SETTINGS_KEY } from '../common/sessionKeyConstant'
import { createLogger } from '../common/logger'

const logger = createLogger('content-script-main')

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

function main() {
  // Prevent multiple executions when the devetools are reconnecting
  if (window.__ddBrowserSdkExtensionCallback) {
    return
  }

  sendEventsToExtension()

  window.addEventListener('__ddBrowserSdkSettingsUpdate', (event) => {
    const settings = (event as CustomEvent).detail as Settings
    if (settings) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_SETTINGS_KEY, JSON.stringify(settings))
      } catch (e) {
        logger.error('Error storing settings in sessionStorage', e)
      }
      applySettings(settings)
    }
  })

  const settings = getSettings()
  if (settings) {
    applySettings(settings)
  } else {
    requestSettingsAsync()
  }
}

function applySettings(settings: Settings) {
  if (noBrowserSdkLoaded()) {
    if (settings.trialMode && settings.sdkInjection.enabled) {
      injectBrowserSDK(settings.sdkInjection)
      return // Early return to prevent other injection methods
    }

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
      injectDevBundle(settings.useRumSlim ? DEV_RUM_SLIM_URL : DEV_RUM_URL, ddRumGlobal)
      injectDevBundle(DEV_LOGS_URL, ddLogsGlobal)
    }
  }
}

function requestSettingsAsync() {
  const settingsResponseListener = (event: Event) => {
    const settings = (event as CustomEvent).detail as Settings
    if (settings) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_SETTINGS_KEY, JSON.stringify(settings))

        applySettings(settings)
      } catch (e) {
        logger.error('Error storing settings in sessionStorage', e)
      }
    }
  }

  window.addEventListener('__ddBrowserSdkSettingsResponse', settingsResponseListener, { once: true })

  window.dispatchEvent(new CustomEvent('__ddBrowserSdkGetSettings'))
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
    logger.error('Error getting settings', error)
    return null
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
  // Always load the bundle via XHR and evaluate it inline. This bypasses page CSP restrictions
  // while still allowing relative chunks/workers to resolve correctly by patching Webpack
  // publicPath with the original URL.
  const xhr = new XMLHttpRequest()
  try {
    xhr.open('GET', url, false) // synchronous to ensure the SDK is available immediately
    xhr.send()
  } catch (error) {
    logger.error(`[DD Browser SDK extension] Error while loading ${url}:`, error)
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

    // Webpack v6+ changed the wording of the runtime guard that throws when `scriptUrl` cannot be
    // determined.  Patch *any* occurrence of that guard so `scriptUrl` is initialised with the
    // actual bundle URL we just downloaded, ensuring chunks/workers resolve correctly.
    sdkCode = sdkCode.replace(
      /if\s*\(!scriptUrl\)\s*throw new Error\([^)]*Automatic publicPath[^)]*\);/,
      `if (!scriptUrl) scriptUrl = ${JSON.stringify(url)};`
    )
    // Fallback – if the above pattern did not match (future wording change), explicitly set the
    // webpack public path at the very top of the bundle so chunk loading keeps working.
    if (!sdkCode.includes(`scriptUrl = ${JSON.stringify(url)}`)) {
      const publicPath = url.substring(0, url.lastIndexOf('/') + 1)
      sdkCode = `window.__webpack_public_path__ = ${JSON.stringify(publicPath)};\n${sdkCode}`
    }

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

function injectBrowserSDK(config: Settings['sdkInjection']) {
  const { sdkTypes, rumBundle, bundleSource, rumConfig, logsConfig } = config

  const injectWhenReady = () => {
    if (sdkTypes.includes('rum')) {
      const rumUrl = getRumBundleUrl(rumBundle, bundleSource, rumConfig.site as string | undefined)
      injectAndInitializeSDK(rumUrl, 'DD_RUM', rumConfig)
    }

    if (sdkTypes.includes('logs')) {
      const logsUrl = getLogsBundleUrl(bundleSource, rumConfig.site as string | undefined)
      injectAndInitializeSDK(logsUrl, 'DD_LOGS', logsConfig)
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWhenReady, { once: true })
  } else {
    injectWhenReady()
  }
}

function getRumBundleUrl(bundle: 'rum' | 'rum-slim', source: 'dev' | 'cdn', site?: string): string {
  if (source === 'cdn') {
    const region = getCdnRegion(site)
    return `${CDN_BASE_URL}/${region}/${CDN_VERSION}/datadog-${bundle}.js`
  }
  return bundle === 'rum-slim' ? DEV_RUM_SLIM_URL : DEV_RUM_URL
}

function getLogsBundleUrl(source: 'dev' | 'cdn', site?: string) {
  if (source === 'cdn') {
    const region = getCdnRegion(site)
    return `${CDN_BASE_URL}/${region}/${CDN_VERSION}/datadog-logs.js`
  }
  return DEV_LOGS_URL
}

function getCdnRegion(site?: string) {
  if (!site || site === 'datadoghq.com') {
    return 'us1'
  }
  if (site === 'datadoghq.eu') {
    return 'eu1'
  }
  if (site.startsWith('us3.')) {
    return 'us3'
  }
  if (site.startsWith('us5.')) {
    return 'us5'
  }
  if (site.endsWith('datad0g.com')) {
    return 'us3'
  }
  // fall back to us1
  return 'us1'
}

function injectAndInitializeSDK(url: string, globalName: 'DD_RUM' | 'DD_LOGS', config: object) {
  // If the SDK is already loaded, don't try to load it again
  if (window[globalName]) {
    logger.log(`${globalName} already exists, skipping injection`)
    return
  }

  // For CDN URLs, use a more reliable script injection approach
  if (url.includes('datadoghq-browser-agent.com')) {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      if (window[globalName] && 'init' in window[globalName]) {
        try {
          window[globalName].init(config)
        } catch (e) {
          logger.error(`Error initializing ${globalName}:`, e)
        }
      } else {
        logger.error(`${globalName} not found after script load`)
      }
    }
    script.onerror = (e) => {
      logger.error(`Error loading ${globalName} script:`, e)
    }
    document.head.appendChild(script)
  } else {
    loadSdkScriptFromURL(url)

    const checkAndInit = () => {
      const sdk = window[globalName]
      if (sdk && typeof sdk === 'object' && 'init' in sdk) {
        try {
          sdk.init(config)
        } catch (error) {
          logger.error(`Error while initializing ${globalName}:`, error)
        }
      } else {
        setTimeout(checkAndInit, 100)
      }
    }

    checkAndInit()
  }
}
