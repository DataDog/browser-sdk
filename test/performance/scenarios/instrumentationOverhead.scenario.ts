import { test } from '@playwright/test'
import { createBenchmarkTest } from '../createBenchmarkTest'
import type { BrowserWindow } from '../profiling.type'

declare global {
  interface Window {
    testFunctions: {
      add1: (a: number, b: number) => number
      add2: (a: number, b: number) => number
    }
  }
}

interface BenchmarkResult {
  sum1: number
  sum2: number
  totalTime: number
}

test.describe('benchmark', () => {
  void createBenchmarkTest('instrumentationOverhead').run(async (page, takeMeasurements, appUrl) => {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })

    // Wait for any async setup (e.g. debugger SDK init + first probe-delivery response) to
    // settle. For configurations that don't need it (`none`, `rum`, ...) the harness sets
    // this to `true` upfront so this resolves immediately.
    await page.waitForFunction(() => (window as BrowserWindow).__benchmarkReady === true)

    // WARMUP PHASE: drive enough calls for V8 to JIT-optimize the instrumented hot path
    // *before* we start measuring. Without this, the first slice of the measurement loop
    // would be dominated by interpreter / baseline-tier overhead, which wouldn't reflect
    // steady-state instrumentation cost.
    await page.evaluate(() => {
      let warmupSum = 0
      for (let i = 0; i < 100_000; i++) {
        warmupSum += window.testFunctions.add1(i, i + 1)
        warmupSum += window.testFunctions.add2(i, i + 1)
      }
      console.log('Warmup sum:', warmupSum) // Anchor `warmupSum` so V8 can't elide the loop.
    })

    await takeMeasurements()

    // MEASUREMENT PHASE: tight loop over `add1` (which carries an active probe in the
    // `instrumented_with_probes` configuration), with occasional calls to `add2` (which
    // never has a probe). The latter checks whether activity on a sibling instrumented
    // function deoptimizes the JIT-compiled `add1`.
    const result = await page.evaluate<BenchmarkResult>(() => {
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

      console.log(`Benchmark complete - ${totalTime.toFixed(1)}ms total, sum1: ${sum1}, sum2: ${sum2}`)
      return { sum1, sum2, totalTime }
    })

    console.log('Playwright: Benchmark result:', result)
  })
})
