import puppeteer, { Page } from 'puppeteer'

import { startProfiling } from './profiling'

main().catch(console.error)

async function main() {
  const browser = await puppeteer.launch({ defaultViewport: { width: 1366, height: 768 }, headless: true })
  try {
    const page = await browser.newPage()
    await setupSDK(page)
    const stopProfiling = await startProfiling(page)
    await runScenario(page)
    await stopProfiling()
  } finally {
    await browser.close()
  }
}

async function runScenario(page: Page) {
  await page.goto('https://en.wikipedia.org/wiki/Ubuntu')
  await page.goto('https://en.wikipedia.org/wiki/Datadog')
  await page.goto('https://en.wikipedia.org/wiki/Event_monitoring')
  await page.goto('about:blank')
}

async function setupSDK(page: Page) {
  await page.evaluateOnNewDocument(`
    import('https://www.datadoghq-browser-agent.com/datadog-rum.js')
      .then(() => {
        window.DD_RUM.init({
          clientToken: 'xxx',
          applicationId: 'xxx',
          site: 'localhost',
          trackInteractions: true,
        })
      })
  `)
}
