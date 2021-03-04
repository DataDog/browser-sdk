import puppeteer, { Page } from 'puppeteer'

import { startProfiling } from './profiling'

main().catch(console.error)

async function main() {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1366, height: 768 }, headless: true })
  try {
    const page = await browser.newPage()
    await setupSDK(page)
    const { stopProfiling, takeMeasurements } = await startProfiling(page)
    await runScenario(page, takeMeasurements)
    await stopProfiling()
  } finally {
    await browser.close()
  }
}

async function runScenario(page: Page, takeMeasurements: () => Promise<void>) {
  await page.goto('https://en.wikipedia.org/wiki/Event_monitoring')
  await takeMeasurements()
  await page.goto('https://en.wikipedia.org/wiki/Datadog')
  await takeMeasurements()
  await page.goto('https://en.wikipedia.org/wiki/Ubuntu')
  await takeMeasurements()
  await page.goto('about:blank')
}

async function setupSDK(page: Page) {
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
