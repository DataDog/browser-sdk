/**
 * Worker Profiling — dedicated worker script
 *
 * Two responsibilities:
 * 1. Connect to Datadog worker profiling via attachProfiler()
 * 2. Run a continuous CPU-intensive workload so the profiler captures real call stacks
 *
 * Workloads (all pure JS, no I/O):
 * - Sieve of Eratosthenes (prime numbers up to N)
 * - Recursive Fibonacci
 * - Small matrix multiplication
 * - Mandelbrot set pixel count
 */
import { attachProfiler } from '@datadog/browser-rum/worker'

// Attach to the Datadog profiling pipeline — must be called before any heavy
// work so the Profiler is already running when the workloads start.
attachProfiler()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let running = false
let iterations = 0
let primesFound = 0
let fibResult = 0
let matrixOps = 0
const startTime = Date.now()

// ---------------------------------------------------------------------------
// CPU workloads
// ---------------------------------------------------------------------------

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

/** Naive recursive Fibonacci — intentionally slow to produce deep stacks. */
function fib(n: number): number {
  if (n <= 1) {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}

/** Multiply two N×N matrices filled with incremental values. */
function matmul(n: number): number {
  const a: number[][] = []
  const b: number[][] = []
  for (let i = 0; i < n; i++) {
    a[i] = []
    b[i] = []
    for (let j = 0; j < n; j++) {
      a[i][j] = (i * n + j + 1) / (n * n)
      b[i][j] = (j * n + i + 1) / (n * n)
    }
  }
  let checksum = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0
      for (let k = 0; k < n; k++) {
        sum += a[i][k] * b[k][j]
      }
      checksum += sum
    }
  }
  return checksum
}

/** Count Mandelbrot set pixels for a grid of `size × size`. */
function mandelbrot(size: number, maxIter: number): number {
  let inSet = 0
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const cx = (px / size) * 3.5 - 2.5
      const cy = (py / size) * 2 - 1
      let x = 0
      let y = 0
      let iter = 0
      while (x * x + y * y <= 4 && iter < maxIter) {
        const xTemp = x * x - y * y + cx
        y = 2 * x * y + cy
        x = xTemp
        iter++
      }
      if (iter === maxIter) {
        inSet++
      }
    }
  }
  return inSet
}

// ---------------------------------------------------------------------------
// Main loop — runs one batch of work then yields via setTimeout(0)
// ---------------------------------------------------------------------------
function runOneBatch(): void {
  if (!running) {
    return
  }

  // Alternate workloads each iteration to produce varied call stacks
  const phase = iterations % 4

  if (phase === 0) {
    primesFound = sieve(50_000)
  } else if (phase === 1) {
    fibResult = fib(30)
  } else if (phase === 2) {
    matmul(80)
    matrixOps++
  } else {
    mandelbrot(100, 80)
    matrixOps++
  }

  iterations++

  // Post stats back to the main thread every 4 batches (one full cycle)
  if (iterations % 4 === 0) {
    self.postMessage({
      kind: 'stats',
      iterations,
      primesFound,
      fibResult,
      matrixOps,
      elapsedSeconds: (Date.now() - startTime) / 1000,
    })
  }

  // Yield control so the event loop can process messages (including dd-* commands)
  setTimeout(runOneBatch, 0)
}

// ---------------------------------------------------------------------------
// Message handling from main thread
// ---------------------------------------------------------------------------
self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { kind: string }
  if (!msg || typeof msg.kind !== 'string') {
    return
  }

  if (msg.kind === 'start' && !running) {
    running = true
    setTimeout(runOneBatch, 0)
  } else if (msg.kind === 'stop') {
    running = false
  }
})
