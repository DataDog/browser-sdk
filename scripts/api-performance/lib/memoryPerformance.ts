import type { Browser, CDPSession, Page, Protocol } from 'puppeteer'
import { launch } from 'puppeteer'
import { formatSize, printLog } from '../../lib/executionUtils.ts'
import { reportToDatadog } from './reportToDatadog.ts'
import type { Test } from './constants.ts'
import { TESTS } from './constants.ts'

const NUMBER_OF_RUNS = 30 // Rule of thumb: this should be enough to get a good average
const BATCH_SIZE = 2

interface MemoryResult {
  name: string
  value: number
}

export async function runMemoryPerformanceTest(): Promise<void> {
  const results = await computeMemoryPerformance()

  console.log('Memory Performance:')
  console.table(
    results.map(({ name, value }) => ({
      'Action Name': TESTS.find((test) => test.property === name)?.name ?? name,
      'Memory Consumption': formatSize(value),
    }))
  )

  await reportToDatadog({
    message: 'Browser SDK memory consumption',
    ...Object.fromEntries(results.map(({ name, value }) => [name, { memory_bytes: value }])),
  })
}

async function computeMemoryPerformance(): Promise<MemoryResult[]> {
  const results: MemoryResult[] = []
  const benchmarkUrl = 'https://datadoghq.dev/browser-sdk-test-playground/performance/memory'

  for (let i = 0; i < TESTS.length; i += BATCH_SIZE) {
    await runTests(TESTS.slice(i, i + BATCH_SIZE), benchmarkUrl, (result) => results.push(result))
  }

  return results
}

async function runTests(tests: Test[], benchmarkUrl: string, cb: (result: MemoryResult) => void): Promise<void> {
  await Promise.all(
    tests.map(async (test) => {
      const allBytesMeasurements: number[] = []
      printLog(`Running test for: ${test.button}`)
      for (let j = 0; j < NUMBER_OF_RUNS; j++) {
        const bytes = await runTest(test.button, benchmarkUrl)
        allBytesMeasurements.push(bytes)
      }
      const sdkMemoryBytes = average(allBytesMeasurements)
      printLog(`Average memory used by SDK for ${test.name} over ${NUMBER_OF_RUNS} runs: ${sdkMemoryBytes} bytes`)
      cb({ name: test.property, value: sdkMemoryBytes })
    })
  )
}

async function runTest(testButton: string, benchmarkUrl: string): Promise<number> {
  const browser: Browser = await launch({
    channel: 'chrome',
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
  await client.send('HeapProfiler.startSampling', { samplingInterval: 50 })

  await button.click()
  const { profile } = await client.send('HeapProfiler.stopSampling')

  const measurementsBytes: number[] = []
  const sizeForNodeId = new Map<number, number>()

  for (const sample of profile.samples) {
    sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
    let sdkConsumption = 0
    for (const node of children(profile.head)) {
      const consumption = sizeForNodeId.get(node.id) || 0
      if (isSdkBundleUrl(node.callFrame.url)) {
        sdkConsumption += consumption
      }
    }
    measurementsBytes.push(sdkConsumption)
  }

  const medianBytes = median(measurementsBytes)
  await browser.close()
  return medianBytes
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
