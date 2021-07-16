import puppeteer, { Page } from 'puppeteer'

import { formatProfilingResults } from './format'
import { startProfiling } from './profiling'
import { trackNetwork } from './trackNetwork'
import { ProfilingResults, ProfilingOptions } from './types'
import { startProxy } from './proxy'

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

async function main() {
  const startRecording = process.argv.includes('--recorder')
  const displayHelp = process.argv.includes('-h') || process.argv.includes('--help')

  if (displayHelp) {
    console.log(`Usage: yarn start [options]

This tool runs various scenarios in a browser and profile the impact of the Browser SDK.

Options:
  --help, -h: display this help and exit
  --recorder: start session replay recording at init
`)
    return
  }

  const proxy = await startProxy()

  const options: ProfilingOptions = {
    bundleUrl: 'https://www.datadoghq-browser-agent.com/datadog-rum.js',
    proxy,
    startRecording,
  }

  const wikipediaResults = await profileScenario(options, runWikipediaScenario)

  console.log(`
# Wikipedia

Illustrates a mostly static site scenario.

* Navigate on three Wikipedia articles
* Do a search (with dynamic autocompletion) and go to the first result

${formatProfilingResults(wikipediaResults)}`)

  const twitterResults = await profileScenario(options, runTwitterScenario)

  console.log(`
# Twitter

Illustrates a SPA scenario.

* Navigate to the top trending topics
* Click on the first trending topic
* Click on Top, Latest, People, Photos and Videos tabs
* Navigate to the Settings page
* Click on a few checkboxes

${formatProfilingResults(twitterResults)}`)

  proxy.stop()
}

async function profileScenario(
  options: ProfilingOptions,
  runScenario: (page: Page, takeMeasurements: () => Promise<void>) => Promise<void>
) {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1366, height: 768 },
    // Twitter detects headless browsing and refuses to load
    headless: false,
    args: [`--ignore-certificate-errors-spki-list=${options.proxy.spkiFingerprint}`],
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
            proxyHost: ${JSON.stringify(options.proxy.host)}
          })
          ${options.startRecording ? 'window.DD_RUM.startSessionReplayRecording()' : ''}
        })
    }
  `)
}
