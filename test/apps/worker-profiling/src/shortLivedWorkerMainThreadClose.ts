/**
 * Short-lived worker (variant B — main-thread-close).
 *
 * The worker just does its work. The main thread decides when to stop it
 * by calling datadogRum.flushAndTerminateProfilingWorker(worker), which:
 *   1. Sends dd-flush-and-close to the worker
 *   2. Worker flushes its profiling session and calls self.close()
 *   3. Main thread hard-terminates after a 5s safety timeout
 *
 * No postMessage, no signaling, no manual cleanup needed in the worker.
 */
import { connectDatadogWorker } from '@datadog/browser-rum/worker'

connectDatadogWorker()

// ---------------------------------------------------------------------------
// Workloads
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
  let result = 0
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = result * x + coeffs[i]
  }
  return result
}

// ---------------------------------------------------------------------------
// Run indefinitely — main thread controls lifecycle
// ---------------------------------------------------------------------------
let batches = 0

function runBatch(): void {
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
  setTimeout(runBatch, 0)
}

setTimeout(runBatch, 0)
