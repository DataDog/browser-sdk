import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BrowserWindow, Metrics } from 'profiling.type'
import { startProfiling } from './profilers'
import { reportMetricsToConsole } from './reporters/console'

const bundleUrl = 'https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js'

export const scenarioConfigurations = ['none', 'rum', 'rum_replay', 'rum_profiling'] as const

type ScenarioConfiguration = (typeof scenarioConfigurations)[number]

async function injectSDK(page: Page, scenarioConfiguration: ScenarioConfiguration) {
  await page.addInitScript(`
    function loadSDK() {
      (function(h,o,u,n,d) {
        h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
        d=o.createElement(u);d.async=1;d.src=n
        n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
      })(window,document,'script','${bundleUrl}','DD_RUM')

      window.DD_RUM.onReady(function() {
        window.DD_RUM.init({
          clientToken: 'xxx',
          applicationId: 'xxx',
          site: 'datadoghq.com',
          profilingSampleRate: ${scenarioConfiguration === 'rum_replay' ? 100 : 0},
          sessionReplaySampleRate: ${scenarioConfiguration === 'rum_profiling' ? 100 : 0},
        })
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
            await injectSDK(page, scenarioConfiguration)
          }

          await runner(page, takeMeasurements)

          if (scenarioConfiguration !== 'none') {
            await stopSession(page) // Flush events
          }

          metrics[scenarioConfiguration] = await stopProfiling()
          await page.close()
        })
      })

      test.afterAll(() => {
        reportMetricsToConsole(metrics)
      })
    },
  }
}
