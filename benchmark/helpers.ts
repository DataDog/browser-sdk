import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { BrowserWindow, Metrics } from 'profiling.type'
import { isContinuousIntegration, sdkBundleUrl, testAppUrl } from './environment'
import { startProfiling } from './profilers'
import { reportToConsole } from './reporters/reportToConsole'
import { reportToDatadog } from './reporters/reportToDatadog'

const scenarioConfigurations = ['none', 'rum', 'rum_replay', 'rum_profiling', 'none_with_headers'] as const
const rumApplicationId = 'a81f40b8-e9bd-4805-9b66-4e4edc529a14'
const clientToken = 'pubfe2e138a54296da76dd66f6b0b5f3d98'

type ScenarioConfiguration = (typeof scenarioConfigurations)[number]

async function injectSDK(page: Page, scenarioConfiguration: ScenarioConfiguration) {
  await page.addInitScript(`
    function loadSDK() {
      (function(h,o,u,n,d) {
        h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
        d=o.createElement(u);
        d.async=1;
        d.src=n;
        o.head.appendChild(d);
      })(window,document,'script','${sdkBundleUrl}','DD_RUM')

      window.DD_RUM.onReady(function() {
        window.DD_RUM.init({
          clientToken: '${clientToken}',
          applicationId: '${rumApplicationId}',
          site: 'datad0g.com',
          service: 'browser-sdk-benchmark-${scenarioConfiguration}',
          profilingSampleRate: ${scenarioConfiguration === 'rum_profiling' ? 100 : 0},
          trackBfcacheViews: true,
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

type TestRunner = (page: Page, takeMeasurements: () => Promise<void>, appUrl: string) => Promise<void> | void

function getAppUrl(scenarioConfiguration: ScenarioConfiguration): string {
  const url = new URL(testAppUrl)

  if (
    scenarioConfiguration === 'rum_profiling' ||
    scenarioConfiguration === 'none_with_headers' ||
    scenarioConfiguration === 'rum_replay'
  ) {
    url.searchParams.set('profiling', 'true')
  }

  return url.toString()
}

async function stopSession(page: Page) {
  await page.evaluate(() => {
    ;(window as BrowserWindow).DD_RUM?.stopSession()
  })
}

export function createBenchmarkTest() {
  return {
    run(runner: TestRunner) {
      const metrics: Record<string, Metrics> = {}
      scenarioConfigurations.forEach((scenarioConfiguration) => {
        test(`benchmark ${scenarioConfiguration}`, async ({ page }) => {
          await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' })

          let profileRequestCompleted = false
          if (scenarioConfiguration === 'rum_profiling') {
            page.on('response', (response) => {
              if (response.url().includes('/api/v2/profile') && response.status() === 202) {
                profileRequestCompleted = true
              }
            })
          }

          const { stopProfiling, takeMeasurements } = await startProfiling(page)

          if (scenarioConfiguration !== 'none' && scenarioConfiguration !== 'none_with_headers') {
            await injectSDK(page, scenarioConfiguration)
          }

          await runner(page, takeMeasurements, getAppUrl(scenarioConfiguration))

          if (scenarioConfiguration === 'rum_profiling') {
            const startTime = Date.now()
            while (!profileRequestCompleted && Date.now() - startTime < 60000) {
              await page.waitForTimeout(500)
            }

            if (!profileRequestCompleted) {
              throw new Error('Test failed: Profile was not successfully uploaded to Datadog')
            }
          }

          if (scenarioConfiguration !== 'none' && scenarioConfiguration !== 'none_with_headers') {
            await stopSession(page)
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
