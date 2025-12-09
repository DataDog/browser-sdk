import { test } from '@playwright/test'
import { createBenchmarkTest } from '../createBenchmarkTest'

test.describe('benchmark', () => {
  void createBenchmarkTest('instrumentationOverhead').run(async (page, takeMeasurements, appUrl) => {
    // Navigate to app and wait for initial load
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })

    // WARMUP PHASE: Allow JIT to optimize (100,000+ calls before measurement)
    await page.evaluate(() => {
      let warmupSum = 0
      for (let i = 0; i < 100_000; i++) {
        warmupSum += window.testFunctions.add1(i, i + 1)
        warmupSum += window.testFunctions.add2(i, i + 1)
      }
      console.log('Warmup sum:', warmupSum) // Ensure VM doesn't eliminate warmup
    })

    // Start measuring after warmup
    await takeMeasurements()

    // MEASUREMENT PHASE: Heavy stress test
    // Benchmark add1, but call add2 occasionally, which under the instrumented_with_probes scenario is instrumented.
    // This is to measure if the instrumentation of add2 has an impact on the VM optimization of add1.
    await page.evaluate(() => {
      let sum1 = 0
      let sum2 = 0

      const start = performance.now()
      for (let i = 0; i < 10_000_000; i++) {
        sum1 += window.testFunctions.add1(i, i + 1)

        if (i % 100_000 === 0) {
          sum2 += window.testFunctions.add2(i, i + 1)
        }
      }
      const totalTime = performance.now() - start

      // Log accumulated results to ensure VM cannot optimize away function bodies
      const callCounts = (window as any).$_dd_callCounts
      const message = `Benchmark complete - ${totalTime.toFixed(1)}ms total, sum1: ${sum1}, sum2: ${sum2}${
        callCounts ? `, instrumentation: entry=${callCounts.entry} return=${callCounts.return} throw=${callCounts.throw}` : ''
      }`
      console.log(message)

      // Also set on window so we can retrieve it
      ;(window as any).benchmarkResult = { sum1, sum2, totalTime, callCounts }
    })

    // Retrieve and log the result to verify it ran
    const result = await page.evaluate(() => (window as any).benchmarkResult)
    console.log('Playwright: Benchmark result:', result)
  })
})
