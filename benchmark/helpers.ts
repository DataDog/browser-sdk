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

async function injectSDK(page: Page, scenarioName: string, scenarioConfiguration: ScenarioConfiguration) {
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
          service: 'browser-sdk-continuous-benchmark',
          profilingSampleRate: ${scenarioConfiguration === 'rum_profiling' ? 100 : 0},
          trackBfcacheViews: true,
        })
        console.log('DD_RUM SDK initialized with profiling rate:', ${scenarioConfiguration === 'rum_profiling' ? 100 : 0})
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
  
  // Add profiling parameter for configurations that need response headers
  if (scenarioConfiguration === 'rum_profiling' || scenarioConfiguration === 'none_with_headers' || scenarioConfiguration === 'rum_replay') {
    url.searchParams.set('profiling', 'true')
  }
  
  return url.toString()
}

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

          if (scenarioConfiguration !== 'none' && scenarioConfiguration !== 'none_with_headers') {
            await injectSDK(page, scenarioName, scenarioConfiguration)
          }

          await runner(page, takeMeasurements, getAppUrl(scenarioConfiguration))

          // Wait for profiler to finish capturing and sending profiles
          if (scenarioConfiguration === 'rum_profiling') {
            console.log('Waiting for profiles to be sent...')
            await page.waitForTimeout(5000) // Give profiler time to send profiles
          }

          if (scenarioConfiguration !== 'none' && scenarioConfiguration !== 'none_with_headers') {
            await stopSession(page) // Flush events
          }
          
          // Additional wait after stopping session to ensure profiles are uploaded
          if (scenarioConfiguration === 'rum_profiling') {
            await page.waitForTimeout(2000)
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
