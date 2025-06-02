const puppeteer = require('puppeteer')
const { fetchPR, LOCAL_BRANCH } = require('../../lib/gitUtils')
const { TESTS_CONFIG } = require('./constants')
const NUMBER_OF_RUNS = 30 // Rule of thumb: this should be enough to get a good average
const BATCH_SIZE = 2

async function computeMemoryPerformance() {
  const results = []
  const pr = await fetchPR(LOCAL_BRANCH)
  const benchmarkUrl = pr
    ? `https://datadoghq.dev/browser-sdk-test-playground/performance/memory?prNumber=${pr.number}`
    : 'https://datadoghq.dev/browser-sdk-test-playground/performance/memory'

  for (let i = 0; i < TESTS_CONFIG.length; i += BATCH_SIZE) {
    await runTests(TESTS_CONFIG.slice(i, i + BATCH_SIZE), benchmarkUrl, (result) => results.push(result))
  }

  return results
}

async function runTests(tests, benchmarkUrl, cb) {
  await Promise.all(
    tests.map(async (test) => {
      const testName = test.name
      const testButton = test.button
      const testProperty = test.property
      const allBytesMeasurements = []
      const allPercentageMeasurements = []
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

async function runTest(testButton, benchmarkUrl) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(benchmarkUrl)

  // Start the Chrome DevTools Protocol session and enable the heap profiler
  const client = await page.target().createCDPSession()
  await client.send('HeapProfiler.enable')

  // Select the button to trigger the test
  await page.waitForSelector(`${testButton}`)
  const button = await page.$(`${testButton}`)

  await client.send('HeapProfiler.collectGarbage')

  // Start the heap profiler sampling
  await client.send('HeapProfiler.startSampling', {
    samplingInterval: 50,
  })

  await button.click()
  const { profile } = await client.send('HeapProfiler.stopSampling')
  const measurementsPercentage = []
  const measurementsBytes = []
  const sizeForNodeId = new Map()
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

function* children(node) {
  yield node
  for (const child of node.children || []) {
    yield* children(child)
  }
}
function isSdkBundleUrl(url) {
  return (
    url.startsWith('https://www.datad0g-browser-agent.com/') ||
    url.startsWith('https://www.datadoghq-browser-agent.com/')
  )
}

function average(values) {
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
}

function median(values) {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)]
}

module.exports = { computeMemoryPerformance }
