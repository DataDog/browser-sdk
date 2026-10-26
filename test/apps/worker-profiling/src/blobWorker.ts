/**
 * Worker Profiling — blob: URL worker (use-case 3)
 *
 * Demonstrates that `attachProfiler()` works identically inside a worker constructed
 * from a `blob:` URL, i.e. a worker that has NO HTTP response of its own and therefore
 * cannot carry its own `Document-Policy: js-profiling` header.
 *
 * For `blob:` (and `data:`) URL dedicated workers, Chromium instead INHERITS the
 * Document-Policy of the creator (main) document — this inheritance landed upstream in
 * Chromium M154 (CL 7857031, "Inherit and apply Document Policy for local-scheme
 * dedicated workers"). Below M154, constructing this worker will still succeed, but
 * `attachProfiler()` will fail with a `missing-document-policy-header` dd-worker-error
 * because the inherited policy isn't recognised yet.
 *
 * This file is built as its own webpack entry (see webpack.config.cjs) and fetched as
 * text by main.ts at runtime, wrapped in a `Blob`, and loaded via
 * `new Worker(URL.createObjectURL(blob))` — see main.ts for the construction code.
 *
 * Kept deliberately small: one lightweight CPU workload (Sieve of Eratosthenes) is
 * enough to produce real call stacks for the profiler to sample.
 */
import { attachProfiler } from '@datadog/browser-rum/worker'

attachProfiler()

let iterations = 0
let primesFound = 0
const startTime = Date.now()

/** Sieve of Eratosthenes up to `limit`. Returns the count of primes found. */
function sieve(limit: number): number {
  const composite = new Uint8Array(limit + 1)
  for (let i = 2; i * i <= limit; i++) {
    if (!composite[i]) {
      for (let j = i * i; j <= limit; j += i) {
        composite[j] = 1
      }
    }
  }
  let count = 0
  for (let i = 2; i <= limit; i++) {
    if (!composite[i]) {
      count++
    }
  }
  return count
}

function runOneBatch(): void {
  primesFound = sieve(50_000)
  iterations++

  self.postMessage({
    kind: 'stats',
    iterations,
    primesFound,
    elapsedSeconds: (Date.now() - startTime) / 1000,
  })

  // Yield control so the event loop can process dd-* commands
  setTimeout(runOneBatch, 0)
}

setTimeout(runOneBatch, 0)
