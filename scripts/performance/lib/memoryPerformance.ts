import type { Browser, CDPSession, Page, Protocol } from 'puppeteer'
import { launch } from 'puppeteer'
import { fetchPR, LOCAL_BRANCH } from '../../lib/gitUtils.ts'
import { formatSize, printLog } from '../../lib/executionUtils.ts'
import { markdownArray, type Pr } from './reportAsAPrComment.ts'
import type { Test } from './constants.ts'
import { TESTS } from './constants.ts'
import type { PerformanceMetric } from './fetchPerformanceMetrics.ts'
import { fetchPerformanceMetrics } from './fetchPerformanceMetrics.ts'
import { reportToDatadog } from './reportToDatadog.ts'

const NUMBER_OF_RUNS = 30 // Rule of thumb: this should be enough to get a good average
const BATCH_SIZE = 2

interface TestRunResult {
  medianPercentage: number
  medianBytes: number
}

export async function computeAndReportMemoryPerformance(pr?: Pr) {
  const localMemoryPerformances = await computeMemoryPerformance()
  await reportToDatadog({
    message: 'Browser SDK memory consumption',
    ...Object.fromEntries(localMemoryPerformances.map(({ name, value }) => [name, { memory_bytes: value }])),
  })
  if (!pr) {
    return
  }
  let baseMemoryPerformances: PerformanceMetric[]
  try {
    baseMemoryPerformances = await fetchPerformanceMetrics(
      'memory',
      localMemoryPerformances.map((memoryPerformance) => memoryPerformance.name),
      pr.lastCommonCommit
    )
  } catch (error) {
    await pr.setMemoryPerformance('Error fetching base memory performance')
    throw error
  }

  await pr.setMemoryPerformance(
    formatMemoryPerformance({
      baseMemoryPerformances,
      localMemoryPerformances,
    })
  )
}

export async function computeMemoryPerformance(): Promise<PerformanceMetric[]> {
  const results: PerformanceMetric[] = []
  const pr = LOCAL_BRANCH ? await fetchPR(LOCAL_BRANCH) : null
  const benchmarkUrl = pr
    ? `https://datadoghq.dev/browser-sdk-test-playground/performance/memory?prNumber=${pr.number}`
    : 'https://datadoghq.dev/browser-sdk-test-playground/performance/memory'

  for (let i = 0; i < TESTS.length; i += BATCH_SIZE) {
    await runTests(TESTS.slice(i, i + BATCH_SIZE), benchmarkUrl, (result) => results.push(result))
  }

  return results
}

async function runTests(tests: Test[], benchmarkUrl: string, cb: (result: PerformanceMetric) => void): Promise<void> {
  await Promise.all(
    tests.map(async (test) => {
      const testName = test.name
      const testButton = test.button
      const allBytesMeasurements: number[] = []
      const allPercentageMeasurements: number[] = []
      printLog(`Running test for: ${testButton}`)
      for (let j = 0; j < NUMBER_OF_RUNS; j++) {
        const { medianPercentage, medianBytes } = await runTest(testButton, benchmarkUrl)
        allPercentageMeasurements.push(medianPercentage)
        allBytesMeasurements.push(medianBytes)
      }
      const sdkMemoryPercentage = average(allPercentageMeasurements)
      const sdkMemoryBytes = average(allBytesMeasurements)
      printLog(
        `Average percentage of memory used by SDK for ${testName} over ${NUMBER_OF_RUNS} runs: ${sdkMemoryPercentage}%  for ${sdkMemoryBytes} bytes`
      )
      cb({ name: test.property, value: sdkMemoryBytes })
    })
  )
}

async function runTest(testButton: string, benchmarkUrl: string): Promise<TestRunResult> {
  const browser: Browser = await launch({
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

function formatMemoryPerformance({
  baseMemoryPerformances,
  localMemoryPerformances,
}: {
  baseMemoryPerformances: PerformanceMetric[]
  localMemoryPerformances: PerformanceMetric[]
}) {
  return markdownArray({
    headers: [
      { label: 'Action Name', align: 'left' },
      { label: 'Base Memory Consumption', align: 'right' },
      { label: 'Local Memory Consumption', align: 'right' },
      { label: '𝚫', align: 'right' },
    ],
    rows: localMemoryPerformances.map((localMemoryPerformance) => {
      const baseMemoryPerformance = baseMemoryPerformances.find(
        (baseMemoryPerformance) => baseMemoryPerformance.name === localMemoryPerformance.name
      )

      if (!baseMemoryPerformance) {
        return [localMemoryPerformance.name, 'N/A', formatSize(localMemoryPerformance.value), 'N/A']
      }

      return [
        TESTS.find((test) => test.property === localMemoryPerformance.name)!.name,
        formatSize(baseMemoryPerformance.value),
        formatSize(localMemoryPerformance.value),
        formatSize(localMemoryPerformance.value - baseMemoryPerformance.value, {
          includeSign: true,
        }),
      ]
    }),
  })
}
