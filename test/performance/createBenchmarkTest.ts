import { test } from '@playwright/test'
import type { Page, CDPSession, Browser } from '@playwright/test'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
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

          if (shouldInjectRumSDK(scenarioConfiguration)) {
            await injectRumSDK(page, scenarioConfiguration, scenarioName)
          }

          if (shouldInjectLiveDebugger(scenarioConfiguration)) {
            await injectLiveDebugger(page, scenarioConfiguration, scenarioName)
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

async function injectLiveDebugger(page: Page, scenarioConfiguration: ScenarioConfiguration, scenarioName: string) {
  // Set flag for app to use instrumented functions
  await page.addInitScript(() => {
    ;(window as any).USE_INSTRUMENTED = true
  })

  // Load live-debugger SDK (using local build for now)
  await page.addInitScript(() => {
    // Define global hooks that instrumented code expects
    // These do minimal work that the VM can't optimize away
    // Signatures match the real implementations from packages/live-debugger/src/domain/api.ts

    // Pre-populate with a dummy key to help V8 optimize property lookups.
    // Removing this shows a much larger performance overhead.
    // Benchmarks show that using an object is much faster than a Map.
    const probesObj: Record<string, any> = { __dummy__: undefined }

    // Container used to hold some data manipulated by the $dd_* functions to ensure the VM doesn't optimize them away.
    const callCounts = { entry: 0, return: 0, throw: 0 }

    ;(window as any).$dd_probes = (functionId: string) => probesObj[functionId]
    ;(window as any).$dd_entry = (probes: any[], self: any, args: Record<string, any>) => {
      callCounts.entry++
    }
    ;(window as any).$dd_return = (probes: any[], value: any, self: any, args: Record<string, any>, locals: Record<string, any>) => {
      callCounts.return++
      return value
    }
    ;(window as any).$dd_throw = (probes: any[], error: Error, self: any, args: Record<string, any>) => {
      callCounts.throw++
    }

    // Variables starting with $_dd are not going to exist in the real code, but are on the global scope in this benchmark to allow the benchmark to modify them.
    ;(window as any).$_dd_probesObj = probesObj
    ;(window as any).$_dd_callCounts = callCounts
  })

  // Initialize live-debugger after page loads
  await page.addInitScript(
    ({ scenarioConfiguration }: { scenarioConfiguration: ScenarioConfiguration }) => {
      document.addEventListener('DOMContentLoaded', () => {
        // In a real scenario, DD_LIVE_DEBUGGER would be loaded from a bundle
        // For now, we're just testing the instrumentation overhead with the hooks
        const browserWindow = window as any

        // Mock init that sets up the hooks properly
        if (!browserWindow.DD_LIVE_DEBUGGER) {
          browserWindow.DD_LIVE_DEBUGGER = {
            init: () => {
              // Hooks are already defined in the init script
            },
            addProbe: (probe: any) => {
              // For instrumented_with_probes, add the probe to the object
              if (scenarioConfiguration === 'instrumented_with_probes') {
                browserWindow.$_dd_probesObj['instrumented.ts;add1'] = [probe]
              }
            },
            version: 'test',
          }

          // Auto-init for testing
          browserWindow.DD_LIVE_DEBUGGER.init()

          // Add probe for add1 in instrumented_with_probes scenario
          if (scenarioConfiguration === 'instrumented_with_probes') {
            browserWindow.DD_LIVE_DEBUGGER.addProbe({
              id: 'test-probe',
              functionId: 'instrumented.ts;add1',
            })
          }
        }
      })
    },
    { scenarioConfiguration }
  )
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
    () => (window as BrowserWindow).DD_RUM?.version || (window as BrowserWindow).DD_LIVE_DEBUGGER?.version || ''
  )
}

function shouldInjectRumSDK(scenarioConfiguration: ScenarioConfiguration): boolean {
  return ['rum', 'rum_replay', 'rum_profiling'].includes(scenarioConfiguration)
}

function shouldInjectLiveDebugger(scenarioConfiguration: ScenarioConfiguration): boolean {
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
