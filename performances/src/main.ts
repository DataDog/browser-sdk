import puppeteer, { Page } from 'puppeteer'

import { formatProfilingResults } from './format'
import { startProfiling } from './profiling'
import { ProfilingResults } from './types'

main().catch(console.error)

async function main() {
  const wikipediaResults = await profileScenario(runWikipediaScenario)

  console.log('# Wikipedia:')
  console.log()
  console.log(formatProfilingResults(wikipediaResults))
}

async function profileScenario(runScenario: (page: Page, takeMeasurements: () => Promise<void>) => Promise<void>) {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1366, height: 768 }, headless: true })
  let result: ProfilingResults
  try {
    const page = await browser.newPage()
    await setupSDK(page)
    const { stopProfiling, takeMeasurements } = await startProfiling(page)
    await runScenario(page, takeMeasurements)
    result = await stopProfiling()
  } finally {
    await browser.close()
  }
  return result
}

async function runWikipediaScenario(page: Page, takeMeasurements: () => Promise<void>) {
  await page.goto('https://en.wikipedia.org/wiki/Event_monitoring')
  await takeMeasurements()
  await page.goto('https://en.wikipedia.org/wiki/Datadog')
  await takeMeasurements()
  await page.goto('https://en.wikipedia.org/wiki/Ubuntu')
  await takeMeasurements()
  await page.goto('about:blank')
}

async function setupSDK(page: Page) {
  await page.setBypassCSP(true)
  await page.evaluateOnNewDocument(`
    if (location.href !== 'about:blank') {
      import('https://www.datadoghq-browser-agent.com/datadog-rum.js')
        .then(() => {
          window.DD_RUM.init({
            clientToken: 'xxx',
            applicationId: 'xxx',
            site: 'localhost',
            trackInteractions: true,
          })
        })
    }
  `)
}
