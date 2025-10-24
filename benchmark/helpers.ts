import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BrowserWindow, Metrics } from 'profiling.type'
import { isContinuousIntegration } from './environment'
import { startProfiling } from './profilers'
import { reportToConsole } from './reporters/reportToConsole'
import { reportToDatadog } from './reporters/reportToDatadog'

const bundleUrl = 'https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js'
const scenarioConfigurations = ['none', 'rum', 'rum_replay', 'rum_profiling'] as const
const rumApplicationId = '9fa62a5b-8a7e-429d-8466-8b111a4d4693'

type ScenarioConfiguration = (typeof scenarioConfigurations)[number]

async function injectSDK(page: Page, scenarioName: string, scenarioConfiguration: ScenarioConfiguration) {
  await page.addInitScript(`
    function loadSDK() {
      (function(h,o,u,n,d) {
        h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
        d=o.createElement(u);d.async=1;d.src=n
        n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
      })(window,document,'script','${bundleUrl}','DD_RUM')

      window.DD_RUM.onReady(function() {
        window.DD_RUM.init({
          clientToken: '${isContinuousIntegration ? 'pubab31fd1ab9d01d2b385a8aa3dd403b1d' : 'fake-client-token' /** prevent sending event in local environment */}',
          applicationId: '${rumApplicationId}',
          site: 'datadoghq.com',
          service: 'browser-sdk-continuous-benchmark',
          profilingSampleRate: ${scenarioConfiguration === 'rum_replay' ? 100 : 0},
          sessionReplaySampleRate: ${scenarioConfiguration === 'rum_profiling' ? 100 : 0},
          trackBfcacheViews: true,
        })
        window.DD_RUM.addContext('scenario', { name: '${scenarioName}', configuration: '${scenarioConfiguration}' })
      })
    }

    document.addEventListener("readystatechange", (event) => {
      if (document.readyState === "interactive") {
        loadSDK()
      }
    });
  `)
}

type TestRunner = (page: Page, takeMeasurements: () => Promise<void>) => Promise<void> | void

async function stopSession(page: Page) {
  await page.evaluate(() => {
    ;(window as BrowserWindow).DD_RUM?.stopSession()
  })
}

export function createBenchmarkTest(scenarioName: string) {
  return {
    run(runner: TestRunner) {
      const metrics: Record<string, Metrics> = {}
      scenarioConfigurations.forEach((scenarioConfiguration) => {
        test(`${scenarioName} ${scenarioConfiguration}`, async ({ page }) => {
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' })

          const { stopProfiling, takeMeasurements } = await startProfiling(page)

          if (scenarioConfiguration !== 'none') {
            await injectSDK(page, scenarioName, scenarioConfiguration)
          }

          await runner(page, takeMeasurements)

          if (scenarioConfiguration !== 'none') {
            await stopSession(page) // Flush events
          }

          metrics[scenarioConfiguration] = await stopProfiling()
          await page.close()
        })
      })

      test.afterAll(async () => {
        reportToConsole(metrics)
        if (isContinuousIntegration) {
          await reportToDatadog(metrics, rumApplicationId)
        }
      })
    },
  }
}
