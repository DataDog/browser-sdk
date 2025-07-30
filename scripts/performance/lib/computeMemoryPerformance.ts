import type { Browser, CDPSession, Page, Protocol } from 'puppeteer'
import puppeteer from 'puppeteer'
import { fetchPR, LOCAL_BRANCH } from '../../lib/gitUtils.ts'

const NUMBER_OF_RUNS = 30 // Rule of thumb: this should be enough to get a good average
const BATCH_SIZE = 2

interface Test {
  name: string
  button: string
  property: string
}

interface MemoryResult {
  testProperty: string
  sdkMemoryBytes: number
  sdkMemoryPercentage: number
}

interface TestRunResult {
  medianPercentage: number
  medianBytes: number
}

const TESTS: Test[] = [
  {
    name: 'RUM - add global context',
    button: '#rum-add-global-context',
    property: 'addglobalcontext',
  },
  {
    name: 'RUM - add action',
    button: '#rum-add-action',
    property: 'addaction',
  },
  {
    name: 'RUM - add error',
    button: '#rum-add-error',
    property: 'adderror',
  },
  {
    name: 'RUM - add timing',
    button: '#rum-add-timing',
    property: 'addtiming',
  },
  {
    name: 'RUM - start view',
    button: '#rum-start-view',
    property: 'startview',
  },
  {
    name: 'RUM - start/stop session replay recording',
    button: '#rum-start-stop-session-replay-recording',
    property: 'startstopsessionreplayrecording',
  },
  {
    name: 'Logs - log message',
    button: '#logs-log-message',
    property: 'logmessage',
  },
]

export async function computeMemoryPerformance(): Promise<MemoryResult[]> {
  const results: MemoryResult[] = []
  const pr = LOCAL_BRANCH ? await fetchPR(LOCAL_BRANCH) : null
  const benchmarkUrl = pr
    ? `https://datadoghq.dev/browser-sdk-test-playground/performance/memory?prNumber=${pr.number}`
    : 'https://datadoghq.dev/browser-sdk-test-playground/performance/memory'

  for (let i = 0; i < TESTS.length; i += BATCH_SIZE) {
    await runTests(TESTS.slice(i, i + BATCH_SIZE), benchmarkUrl, (result) => results.push(result))
  }

  return results
}

async function runTests(tests: Test[], benchmarkUrl: string, cb: (result: MemoryResult) => void): Promise<void> {
  await Promise.all(
    tests.map(async (test) => {
      const testName = test.name
      const testButton = test.button
      const testProperty = test.property
      const allBytesMeasurements: number[] = []
      const allPercentageMeasurements: number[] = []
      console.log(`Running test for: ${testButton}`)
      for (let j = 0; j < NUMBER_OF_RUNS; j++) {
        const { medianPercentage, medianBytes } = await runTest(testButton, benchmarkUrl)
        allPercentageMeasurements.push(medianPercentage)
        allBytesMeasurements.push(medianBytes)
      }
      const sdkMemoryPercentage = average(allPercentageMeasurements)
      const sdkMemoryBytes = average(allBytesMeasurements)
      console.log(
        `Average percentage of memory used by SDK for ${testName} over ${NUMBER_OF_RUNS} runs: ${sdkMemoryPercentage}%  for ${sdkMemoryBytes} bytes`
      )
      cb({ testProperty, sdkMemoryBytes, sdkMemoryPercentage })
    })
  )
}

async function runTest(testButton: string, benchmarkUrl: string): Promise<TestRunResult> {
  const browser: Browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page: Page = await browser.newPage()
  await page.goto(benchmarkUrl)

  // Start the Chrome DevTools Protocol session and enable the heap profiler
  const client: CDPSession = await page.target().createCDPSession()
  await client.send('HeapProfiler.enable')

  // Select the button to trigger the test
  await page.waitForSelector(testButton)
  const button = await page.$(testButton)
  if (!button) {
    throw new Error(`Button ${testButton} not found`)
  }

  await client.send('HeapProfiler.collectGarbage')

  // Start the heap profiler sampling
  await client.send('HeapProfiler.startSampling', {
    samplingInterval: 50,
  })

  await button.click()
  const { profile } = await client.send('HeapProfiler.stopSampling')
  const measurementsPercentage: number[] = []
  const measurementsBytes: number[] = []
  const sizeForNodeId = new Map<number, number>()

  for (const sample of profile.samples) {
    sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
    let totalSize = 0
    let sdkConsumption = 0
    for (const node of children(profile.head)) {
      const consumption = sizeForNodeId.get(node.id) || 0
      totalSize += consumption
      if (isSdkBundleUrl(node.callFrame.url)) {
        sdkConsumption += consumption
      }
    }
    const sdkPercentage = (sdkConsumption / totalSize) * 100
    measurementsBytes.push(sdkConsumption)
    measurementsPercentage.push(sdkPercentage)
  }

  const medianPercentage = median(measurementsPercentage)
  const medianBytes = median(measurementsBytes)
  await browser.close()
  return { medianPercentage, medianBytes }
}

function* children(
  node: Protocol.HeapProfiler.SamplingHeapProfileNode
): Generator<Protocol.HeapProfiler.SamplingHeapProfileNode> {
  yield node
  for (const child of node.children || []) {
    yield* children(child)
  }
}

function isSdkBundleUrl(url: string): boolean {
  return (
    url.startsWith('https://www.datad0g-browser-agent.com/') ||
    url.startsWith('https://www.datadoghq-browser-agent.com/')
  )
}

function average(values: number[]): number {
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}
