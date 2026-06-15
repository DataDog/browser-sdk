/**
 * Short-lived worker — does a burst of CPU work then terminates.
 *
 * Spawned by the main thread every 30 seconds to demonstrate that
 * Datadog worker profiling also works for transient workers.
 */
import { connectDatadogWorker } from '@datadog/browser-rum/worker'

connectDatadogWorker()

// ---------------------------------------------------------------------------
// Workloads
// ---------------------------------------------------------------------------

function sortHeavy(n: number): number {
  const arr = Array.from({ length: n }, (_, i) => Math.sin(i) * 1e6)
  arr.sort((a, b) => a - b)
  return arr[0]
}

function primeFactors(n: number): number[] {
  const factors: number[] = []
  let d = 2
  while (d * d <= n) {
    while (n % d === 0) { factors.push(d); n = Math.floor(n / d) }
    d++
  }
  if (n > 1) factors.push(n)
  return factors
}

function sha256Like(input: string): number {
  // Not a real SHA-256 — just a CPU-burner that looks like one in profiles
  let h = 0x6a09e667
  for (let round = 0; round < 200; round++) {
    for (let i = 0; i < input.length; i++) {
      h = Math.imul(h ^ input.charCodeAt(i), 0x9e3779b9)
      h = (h << 13) | (h >>> 19)
    }
  }
  return h >>> 0
}

// ---------------------------------------------------------------------------
// Burst: run workloads for ~5 seconds then self-close
// ---------------------------------------------------------------------------
const BURST_DURATION_MS = 5_000
const startTime = Date.now()
let batches = 0

function runBurst(): void {
  const elapsed = Date.now() - startTime
  if (elapsed >= BURST_DURATION_MS) {
    self.postMessage({ kind: 'done', batches, elapsedMs: elapsed })
    self.close()
    return
  }

  const phase = batches % 3
  if (phase === 0) {
    sortHeavy(10_000)
  } else if (phase === 1) {
    for (let i = 0; i < 500; i++) primeFactors(999_983)
  } else {
    for (let i = 0; i < 100; i++) sha256Like('datadog-worker-profiling-test')
  }

  batches++
  setTimeout(runBurst, 0)
}

setTimeout(runBurst, 0)
