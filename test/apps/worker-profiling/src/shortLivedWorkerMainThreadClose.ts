/**
 * Short-lived worker (variant 2) — closed from the main thread.
 *
 * Does a burst of CPU work, then posts { kind: 'done' } and waits.
 * The main thread calls datadogRum.flushAndTerminateProfilingWorker(worker),
 * which sends dd-flush-and-close, causing the agent to flush then self.close().
 */
import { connectDatadogWorker } from '@datadog/browser-rum/worker'

connectDatadogWorker()

// ---------------------------------------------------------------------------
// Workloads (different from shortLivedWorker.ts so they look distinct in profiles)
// ---------------------------------------------------------------------------

function insertionSort(arr: number[]): number[] {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i]
    let j = i - 1
    while (j >= 0 && arr[j] > key) { arr[j + 1] = arr[j]; j-- }
    arr[j + 1] = key
  }
  return arr
}

function collatz(n: number): number {
  let steps = 0
  while (n !== 1) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1
    steps++
  }
  return steps
}

function polynomialEval(coeffs: number[], x: number): number {
  // Horner's method
  let result = 0
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = result * x + coeffs[i]
  }
  return result
}

// ---------------------------------------------------------------------------
// Burst
// ---------------------------------------------------------------------------
const BURST_DURATION_MS = 5_000
const startTime = Date.now()
let batches = 0

function runBurst(): void {
  const elapsed = Date.now() - startTime
  if (elapsed >= BURST_DURATION_MS) {
    // Signal done — main thread will call flushAndTerminateProfilingWorker()
    self.postMessage({ kind: 'done', batches, elapsedMs: elapsed })
    return
  }

  const phase = batches % 3
  if (phase === 0) {
    const arr = Array.from({ length: 2_000 }, (_, i) => Math.cos(i))
    insertionSort(arr)
  } else if (phase === 1) {
    let total = 0
    for (let n = 1; n <= 5_000; n++) total += collatz(n)
    void total
  } else {
    const coeffs = Array.from({ length: 50 }, (_, i) => Math.sin(i))
    let sum = 0
    for (let x = 0; x < 1000; x++) sum += polynomialEval(coeffs, x / 1000)
    void sum
  }

  batches++
  setTimeout(runBurst, 0)
}

setTimeout(runBurst, 0)
