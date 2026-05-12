import { resolve } from 'node:path'
import { test } from '@playwright/test'
import type { Page, CDPSession, Browser } from '@playwright/test'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { DebuggerInitConfiguration } from '@datadog/browser-debugger'
import type { BrowserWindow, Metrics } from './profiling.type'
import { startProfiling } from './profilers'
import { reportToConsole } from './reporters/reportToConsole'
import { reportToDatadog } from './reporters/reportToDatadog'
import { isContinuousIntegration } from './environment'
import type { Server } from './server'
import { startPerformanceServer } from './server'
import { CLIENT_TOKEN, APPLICATION_ID, DATADOG_SITE, SDK_BUNDLE_URL } from './configuration'

const SCENARIO_CONFIGURATIONS = [
  'none',
  'rum',
  'rum_replay',
  'rum_profiling',
  'none_with_headers',
  'instrumented_no_probes',
  'instrumented_with_probes',
] as const

type ScenarioConfiguration = (typeof SCENARIO_CONFIGURATIONS)[number]
type TestRunner = (page: Page, takeMeasurements: () => Promise<void>, appUrl: string) => Promise<void> | void

export function createBenchmarkTest(scenarioName: string) {
  return {
    run(runner: TestRunner) {
      const metrics: Record<string, Metrics> = {}
      let sdkVersion: string
      let server: Server

      test.beforeAll(async ({ browser }) => {
        server = await startPerformanceServer(scenarioName)
        await warmup(browser, server.origin)
      })

      SCENARIO_CONFIGURATIONS.forEach((scenarioConfiguration) => {
        test(`${scenarioName} benchmark ${scenarioConfiguration}`, async ({ page }) => {
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' })

          const context = page.context()
          const cdpSession = await context.newCDPSession(page)

          await throttleNetwork(cdpSession)

          const { stopProfiling, takeMeasurements } = await startProfiling(page, cdpSession)

          // Default flag to `true` so scenarios that don't need any async setup don't block on `waitForBenchmarkReady`
          await page.addInitScript(() => {
            ;(window as BrowserWindow).__benchmarkReady = true
          })

          if (shouldInjectRumSDK(scenarioConfiguration)) {
            await injectRumSDK(page, scenarioConfiguration, scenarioName)
          }

          if (shouldInjectDebugger(scenarioConfiguration)) {
            await injectDebugger(page, scenarioConfiguration)
          }

          await runner(page, takeMeasurements, buildAppUrl(server.origin, scenarioConfiguration))

          await flushEvents(page)
          metrics[scenarioConfiguration] = await stopProfiling()
          if (!sdkVersion) {
            sdkVersion = await getSDKVersion(page)
          }
        })
      })

      test.afterAll(async () => {
        server.stop()
        reportToConsole(metrics, sdkVersion)
        if (isContinuousIntegration) {
          await reportToDatadog(metrics, scenarioName, sdkVersion)
        }
      })
    },
  }
}

interface PageInitScriptParameters {
  configuration: Partial<RumInitConfiguration>
  sdkBundleUrl: string
  scenarioConfiguration: ScenarioConfiguration
  scenarioName: string
}

async function injectRumSDK(page: Page, scenarioConfiguration: ScenarioConfiguration, scenarioName: string) {
  const configuration: Partial<RumInitConfiguration> = {
    clientToken: CLIENT_TOKEN,
    applicationId: APPLICATION_ID,
    site: DATADOG_SITE,
    profilingSampleRate: scenarioConfiguration === 'rum_profiling' ? 100 : 0,
    sessionReplaySampleRate: scenarioConfiguration === 'rum_replay' ? 100 : 0,
  }

  await page.addInitScript(
    ({ sdkBundleUrl, scenarioConfiguration, scenarioName, configuration }: PageInitScriptParameters) => {
      function loadSDK() {
        const browserWindow = window as BrowserWindow
        ;(function (h: any, o: Document, u: string, n: string, d: string) {
          h = h[d] = h[d] || {
            q: [],
            onReady(c: () => void) {
              // eslint-disable-next-line
              h.q.push(c)
            },
          }
          const s = o.createElement(u) as HTMLScriptElement
          s.async = true
          s.src = n
          s.crossOrigin = ''
          o.head.appendChild(s)
        })(window, document, 'script', sdkBundleUrl, 'DD_RUM')
        browserWindow.DD_RUM?.onReady(function () {
          browserWindow.DD_RUM!.setGlobalContextProperty('scenario', {
            configuration: scenarioConfiguration,
            name: scenarioName,
          })
          browserWindow.DD_RUM!.init(configuration as RumInitConfiguration)
        })
      }

      // Init scripts run before DOM is ready; wait until "interactive" to append the SDK <script> tag.
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') {
          loadSDK()
        }
      })
    },
    { configuration, sdkBundleUrl: SDK_BUNDLE_URL, scenarioConfiguration, scenarioName }
  )
}

/**
 * Load and initialize the debugger SDK.
 *
 * Done in three sequential init scripts (each runs synchronously, before any of the page's
 * own scripts, on every navigation):
 *
 * 1. Set `window.USE_INSTRUMENTED` so the test app exposes the instrumented function variants.
 * 2. Inline the SDK bundle (synchronous load via `path`), which defines `window.DD_DEBUGGER`.
 * 3. Initialize the SDK and arm `window.__benchmarkReady`.
 *
 * Steps 1-2 must run before the app's `<script>` tag executes, so that the instrumented hot
 * path observes a stable `$dd_probes` shape from its very first call. This matters for
 * statistical soundness: it ensures V8 can JIT-optimize against the final code path during
 * the warmup phase, instead of deoptimizing mid-measurement when probes appear.
 *
 * Step 3 starts an async probe-delivery poll (mocked by the test server) and flips
 * `__benchmarkReady` once the response is observed. The benchmark scenario is responsible
 * for awaiting that flag before running its warmup.
 */
async function injectDebugger(page: Page, scenarioConfiguration: ScenarioConfiguration) {
  await page.addInitScript(() => {
    ;(window as any).USE_INSTRUMENTED = true
    ;(window as BrowserWindow).__benchmarkReady = false
  })

  // Inline the SDK source so `DD_DEBUGGER` is available before the test app runs.
  // TODO: once `@datadog/browser-debugger` is published to the public CDN, switch to the
  // same async-`<script>` snippet pattern used by `injectRumSDK` (load from `SDK_BUNDLE_URL`,
  // init via `onReady`). That matches real customer integration and folds the script-fetch
  // cost into the measured metrics.
  await page.addInitScript({
    path: resolve(import.meta.dirname, '../../packages/debugger/bundle/datadog-debugger.js'),
  })

  const configuration: DebuggerInitConfiguration = {
    clientToken: CLIENT_TOKEN,
    site: DATADOG_SITE,
    // The mock probe-delivery handler keys off `service` to decide which probes to return,
    // so we use the configuration name to keep parallel benchmark workers isolated.
    service: scenarioConfiguration,
    // Effectively disable polling after the initial fetch — re-polling during the
    // measurement loop would add network noise the benchmark doesn't intend to capture.
    pollInterval: 24 * 60 * 60 * 1000, // One day
  }

  await page.addInitScript(
    (params: DebuggerInitScriptParameters) => {
      const browserWindow = window as BrowserWindow
      browserWindow.DD_DEBUGGER!.init(params.configuration)

      // For `instrumented_with_probes`, wait until the first probe-delivery response has
      // populated the registry. Polling at 5 ms keeps the wait tight (typically <50 ms over
      // localhost) without busy-spinning. For `instrumented_no_probes`, the SDK is ready as
      // soon as `init()` returns since no probes are expected.
      const expectedFunctionId = 'instrumented.ts;add1'
      const expectsProbes = params.scenarioConfiguration === 'instrumented_with_probes'

      const markReady = () => {
        browserWindow.__benchmarkReady = true
      }

      const checkReady = () => {
        if (expectsProbes && browserWindow.$dd_probes!(expectedFunctionId) === undefined) {
          setTimeout(checkReady, 5)
          return
        }
        markReady()
      }

      checkReady()
    },
    { configuration, scenarioConfiguration }
  )
}

interface DebuggerInitScriptParameters {
  configuration: DebuggerInitConfiguration
  scenarioConfiguration: ScenarioConfiguration
}

/**
 * Warm-up by loading a page to eliminate inflated TTFB seen on the very first load.
 * Inflated TTFB can come from cold-path costs (DNS resolution, TCP/TLS handshake, etc.).
 */
async function warmup(browser: Browser, url: string) {
  const page = await browser.newPage()
  await page.goto(url)
}

async function getSDKVersion(page: Page) {
  return await page.evaluate(
    () => (window as BrowserWindow).DD_RUM?.version || (window as BrowserWindow).DD_DEBUGGER?.version || ''
  )
}

function shouldInjectRumSDK(scenarioConfiguration: ScenarioConfiguration): boolean {
  return ['rum', 'rum_replay', 'rum_profiling'].includes(scenarioConfiguration)
}

function shouldInjectDebugger(scenarioConfiguration: ScenarioConfiguration): boolean {
  return ['instrumented_no_probes', 'instrumented_with_probes'].includes(scenarioConfiguration)
}

function buildAppUrl(origin: string, scenarioConfiguration: ScenarioConfiguration): string {
  const url = new URL(origin)
  if (scenarioConfiguration === 'rum_profiling' || scenarioConfiguration === 'none_with_headers') {
    url.searchParams.set('profiling', 'true')
  }
  if (scenarioConfiguration === 'instrumented_no_probes' || scenarioConfiguration === 'instrumented_with_probes') {
    url.searchParams.set('instrumented', 'true')
  }
  return url.toString()
}

/**
 * Flushes the events of the SDK and Google Web Vitals
 * by simulating a `visibilitychange` event with the state set to "hidden".
 */
async function flushEvents(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    const hiddenEvent = new Event('visibilitychange', { bubbles: true })
    ;(hiddenEvent as unknown as { __ddIsTrusted: boolean }).__ddIsTrusted = true
    document.dispatchEvent(hiddenEvent)
  })
}

/**
 * Throttle network using Chrome DevTools Protocol
 */
async function throttleNetwork(cdpSession: CDPSession) {
  // Using Regular 4G for realistic performance testing with moderate constraints
  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (4 * 1024 * 1024) / 8, // 4 Mbps in bytes/sec (Regular 4G)
    uploadThroughput: (3 * 1024 * 1024) / 8, // 3 Mbps in bytes/sec
    latency: 20, // 20ms RTT
  })
}
