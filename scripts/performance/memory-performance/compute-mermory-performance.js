const puppeteer = require('puppeteer')
const BUNDLE_URL = 'https://www.datadoghq-browser-agent.com/datadog-rum-canary.js'
const NUMBER_OF_RUNS = 30 // Rule of thumb: 30 runs should be enough to get a good average

async function run() {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1920, height: 1080 },
    headless: true,
  })

  const page = await browser.newPage()
  await page.goto('https://datadoghq.dev/browser-sdk-test-playground/performance/')
  const buttons = await page.$$('button')
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i]
    const buttonName = await page.evaluate((button) => button.innerText, button)
    const allMeasurements = []
    for (let j = 0; j < NUMBER_OF_RUNS; j++) {
      const averageSize = await runTest(i, buttonName)
      allMeasurements.push(averageSize)
    }
    const totalAverageSize = allMeasurements.reduce((a, b) => a + b, 0) / allMeasurements.length
    console.log(
      `Average percentage of memory used by SDK for ${buttonName} over ${NUMBER_OF_RUNS} runs: ${totalAverageSize}%`
    )
  }

  await browser.close()
}

async function runTest(i, buttonName) {
  const browser = await puppeteer.launch({
    defaultViewport: { width: 1920, height: 1080 },
    headless: true,
  })
  const page = await browser.newPage()
  await page.goto('https://datadoghq.dev/browser-sdk-test-playground/performance/')
  const client = await page.target().createCDPSession()
  await client.send('HeapProfiler.enable')
  await page.waitForSelector('button')
  const button = (await page.$$('button'))[i]
  await client.send('HeapProfiler.collectGarbage')
  console.log(`Running test for: ${buttonName}`)
  const measurements = []
  await client.send('HeapProfiler.startSampling', {
    samplingInterval: 100,
  })
  await button.click()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const { profile } = await client.send('HeapProfiler.stopSampling')
  const sizeForNodeId = new Map()
  for (const sample of profile.samples) {
    sizeForNodeId.set(sample.nodeId, (sizeForNodeId.get(sample.nodeId) || 0) + sample.size)
    let totalSize = 0
    let sdkConsumption = 0
    for (const node of iterNodes(profile.head)) {
      const consumption = sizeForNodeId.get(node.id) || 0
      totalSize += consumption
      if (isSdkBundleUrl(node.callFrame.url)) {
        sdkConsumption += consumption
      }
    }
    const sdkPercentage = (sdkConsumption / totalSize) * 100
    measurements.push(sdkPercentage)
  }
  measurements.sort((a, b) => a - b)
  const averageSize = measurements[Math.floor(measurements.length / 2)]
  await browser.close()
  return averageSize
}

function* iterNodes(node) {
  yield node
  for (const child of node.children || []) {
    yield* iterNodes(child)
  }
}
function isSdkBundleUrl(url) {
  return url === BUNDLE_URL
}

run().catch(console.error)
