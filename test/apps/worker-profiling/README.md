# Worker Profiling — Test App

A self-contained single-page app that demonstrates Datadog's experimental web worker CPU
profiling feature (PROF-15093).

## What it does

- Initialises Datadog RUM with `profilingSampleRate: 100`
- Spawns a **dedicated worker** (`profilingWorker.ts`) that runs four CPU-intensive workloads
  in a tight loop (sieve of Eratosthenes, recursive Fibonacci, matrix multiplication, Mandelbrot set)
- Registers the worker with `datadogRum.addProfilingWorker(worker)` so the JS Self-Profiling API
  captures its call stacks and ships them to Datadog alongside the main-thread profile
- Displays live stats (iterations, primes found, fib result, elapsed time) on the page

## Requirements

- **Chromium Canary** with experimental flags enabled:
  ```
  --enable-features=DocumentPolicyInDedicatedWorker,ProfilerAPIForDedicatedWorker
  ```
  or equivalently:
  ```
  --enable-experimental-web-platform-features
  ```
- The `Document-Policy: js-profiling` HTTP response header must be present on **both** the
  page and the worker script. The dev server handles this automatically.

## Running locally

```bash
# From the repo root — build the SDK source packages first if needed:
# yarn build

# From this directory:
cd test/apps/worker-profiling
yarn install
yarn dev
```

Then open **http://localhost:8081** in Chromium Canary with the flags above.

## Building for static serving

```bash
yarn build
# Output is in dist/
```

## Architecture

```
main.ts ──── datadogRum.init()
          ├─ new Worker('/worker.js')
          └─ datadogRum.addProfilingWorker(worker)
                │
                ▼ postMessage({ kind: 'start' })

profilingWorker.ts ──── connectDatadogWorker()   ← Datadog shim
                     └─ runOneBatch() loop        ← CPU workloads
                           ├─ sieve(50_000)
                           ├─ fib(30)
                           ├─ matmul(80)
                           └─ mandelbrot(100, 80)
```

The Datadog shim (`connectDatadogWorker`) listens for `dd-start-profiling` from the main thread
and drives `new Profiler(...)` inside the worker, collecting 60-second rolling traces.
The main-thread coordinator sends those traces to the Datadog profiling intake endpoint.
