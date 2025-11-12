import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { BrowserWindow, Metrics } from './profiling.type'
import { startProfiling } from './profilers'
import { reportToConsole } from './reporters/reportToConsole'
import { reportToDatadog } from './reporters/reportToDatadog'
import { isContinuousIntegration } from './environment'
import { startPerformanceServer } from './server'
import { CLIENT_TOKEN, APPLICATION_ID, DATADOG_SITE, SDK_BUNDLE_URL } from './configuration'

const SCENARIO_CONFIGURATIONS = ['none', 'rum', 'rum_replay', 'rum_profiling', 'none_with_headers'] as const

type ScenarioConfiguration = (typeof SCENARIO_CONFIGURATIONS)[number]
type TestRunner = (page: Page, takeMeasurements: () => Promise<void>, appUrl: string) => Promise<void> | void

export function createBenchmarkTest(scenarioName: string) {
  return {
    run(runner: TestRunner) {
      const metrics: Record<string, Metrics> = {}
      let sdkVersion: string
      let serverOrigin: string

      test.beforeAll(async () => {
        const server = await startPerformanceServer()
        serverOrigin = server.origin
        console.log('Server started on:', serverOrigin)
      })

      SCENARIO_CONFIGURATIONS.forEach((scenarioConfiguration) => {
        test(`${scenarioName} benchmark ${scenarioConfiguration}`, async ({ page }) => {
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' })

          const { stopProfiling, takeMeasurements } = await startProfiling(page)

          if (shouldInjectSDK(scenarioConfiguration)) {
            await injectSDK(page, scenarioConfiguration, scenarioName)
          }

          await runner(page, takeMeasurements, buildAppUrl(serverOrigin, scenarioConfiguration))

          await flushEvents(page)
          metrics[scenarioConfiguration] = await stopProfiling()
          if (!sdkVersion) {
            sdkVersion = await getSDKVersion(page)
          }
        })
      })

      test.afterAll(async () => {
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

async function injectSDK(page: Page, scenarioConfiguration: ScenarioConfiguration, scenarioName: string) {
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

async function getSDKVersion(page: Page) {
  return await page.evaluate(() => (window as BrowserWindow).DD_RUM?.version || '')
}

function shouldInjectSDK(scenarioConfiguration: ScenarioConfiguration): boolean {
  return !['none', 'none_with_headers'].includes(scenarioConfiguration)
}

function buildAppUrl(origin: string, scenarioConfiguration: ScenarioConfiguration): string {
  const url = new URL(origin)
  if (scenarioConfiguration === 'rum_profiling' || scenarioConfiguration === 'none_with_headers') {
    url.searchParams.set('profiling', 'true')
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
