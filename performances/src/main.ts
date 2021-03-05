import puppeteer, { Page } from 'puppeteer'

import { formatProfilingResults } from './format'
import { startProfiling } from './profiling'
import { trackNetwork } from './trackNetwork'
import { ProfilingResults, ProfilingOptions } from './types'

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function main() {
  const options: ProfilingOptions = {
    bundleUrl: 'https://www.datadoghq-browser-agent.com/datadog-rum.js',
    proxyHost: 'datadog-browser-sdk-profiling-proxy',
  }

  const wikipediaResults = await profileScenario(options, runWikipediaScenario)

  console.log('# Wikipedia:')
  console.log()
  console.log(formatProfilingResults(wikipediaResults))
  console.log()

  const twitterResults = await profileScenario(options, runTwitterScenario)

  console.log('# Twitter:')
  console.log()
  console.log(formatProfilingResults(twitterResults))
}

async function profileScenario(
  options: ProfilingOptions,
  runScenario: (page: Page, takeMeasurements: () => Promise<void>) => Promise<void>
) {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1366, height: 768 },
    // Twitter detects headless browsing and refuses to load
    headless: false,
  })
  let result: ProfilingResults
  try {
    const page = await browser.newPage()
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US',
    })
    await setupSDK(page, options)
    const { stopProfiling, takeMeasurements } = await startProfiling(options, page)
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

  await page.type('[type="search"]', 'median', {
    // large delay to trigger the autocomplete menu at each key press
    delay: 400,
  })
  await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')])
  await takeMeasurements()

  await page.goto('https://en.wikipedia.org/wiki/Ubuntu')
  await takeMeasurements()

  await page.goto('about:blank')
}

async function runTwitterScenario(page: Page, takeMeasurements: () => Promise<void>) {
  const { waitForNetworkIdle } = trackNetwork(page)
  await page.goto('https://twitter.com/explore')
  await waitForNetworkIdle()

  // Even if the network is idle, sometimes links take a bit longer to render
  await page.waitForSelector('[data-testid="trend"]')
  await takeMeasurements()
  await page.click('[data-testid="trend"]')
  await waitForNetworkIdle()
  await takeMeasurements()

  // Click on all tabs
  const tabs = await page.$$('[role="tab"]')
  for (const tab of tabs) {
    await tab.click()
    await waitForNetworkIdle()
    await takeMeasurements()
  }

  await page.click('[aria-label="Settings"]')
  await waitForNetworkIdle()
  await takeMeasurements()

  // Scroll to the bottom of the page, because some checkboxes may be hidden below fixed banners
  await page.evaluate(`scrollTo(0, 100000)`)

  // Click on all checkboxes except the first one
  const checkboxes = await page.$$('input[type="checkbox"]')
  for (const checkbox of checkboxes.slice(1)) {
    await checkbox.click()
    await waitForNetworkIdle()
    await takeMeasurements()
  }

  await page.goto('about:blank')
}

async function setupSDK(page: Page, options: ProfilingOptions) {
  await page.setBypassCSP(true)
  await page.evaluateOnNewDocument(`
    if (location.href !== 'about:blank') {
      import(${JSON.stringify(options.bundleUrl)})
        .then(() => {
          window.DD_RUM.init({
            clientToken: 'xxx',
            applicationId: 'xxx',
            site: 'datadoghq.com',
            trackInteractions: true,
            proxyHost: ${JSON.stringify(options.proxyHost)}
          })
        })
    }
  `)
}
