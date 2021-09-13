import puppeteer, { Page } from 'puppeteer'
import { formatProfilingResults } from './format'
import { startProfiling } from './profilers/startProfiling'
import { ProfilingResults, ProfilingOptions } from './types'
import { startProxy } from './proxy'
import { runWikipediaScenario, wikipediaScenarioDescription } from './scenarios/runWikipediaScenario'
import { runTwitterScenario, twitterScenarioDescription } from './scenarios/runTwitterScenario'

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
    bundleUrl: 'https://www.datadoghq-browser-agent.com/datadog-rum-v3.js',
    proxy,
    startRecording,
  }
  const scenarios: Array<[string, (page: Page, takeMeasurements: () => Promise<void>) => Promise<void>]> = [
    [wikipediaScenarioDescription, runWikipediaScenario],
    [twitterScenarioDescription, runTwitterScenario],
  ]

  for (const [description, runScenario] of scenarios) {
    const results = await profileScenario(options, runScenario)
    console.log(`${description}\n\n${formatProfilingResults(results)}`)
  }

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
