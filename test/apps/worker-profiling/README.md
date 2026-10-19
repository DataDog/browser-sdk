# Worker Profiling — Test App

A self-contained single-page app that demonstrates Datadog's experimental web worker CPU
profiling feature (PROF-15093).

## What it does

- Initialises Datadog RUM with `profilingSampleRate: 100`
- Spawns workers of two kinds:
  - **Persistent worker** (`profilingWorker.ts`) — runs four CPU-intensive workloads in a loop
    (sieve of Eratosthenes, recursive Fibonacci, matrix multiplication, Mandelbrot set) for the
    lifetime of the page
  - **Burst workers** (two variants, alternating every 30 s):
    - `shortLivedWorker.ts` — calls `detachProfiler()` then `self.close()` from inside the worker
    - `shortLivedWorkerMainThreadClose.ts` — main thread calls `detach()` + `worker.terminate()`
  - **blob: URL worker** (`blobWorker.ts`) — bundled normally by webpack, then fetched as text and
    loaded via `new Worker(URL.createObjectURL(blob))` instead of a static `/worker.js` URL, to
    demonstrate `Document-Policy` inheritance for local-scheme dedicated workers (Chromium M154+)
- Attaches each worker to the profiling pipeline with `datadogRum.attachProfilingWorker(worker)`
- Points the SDK at a local **proxy server** (`proxy-server.ts`) that:
  - Intercepts all intake requests (profile + RUM) without forwarding them to Datadog
  - Parses each profile payload (deflate-decodes, unpacks FormData, reads wall-time.json)
  - Broadcasts a summary to the browser page via **SSE** (`GET /events`)
- The page displays captured profiles in real time in a three-column layout:
  - **Demo controls** — start/stop persistent worker, spawn burst workers, blob: worker stats
  - **Captured profiles** — live cards with sample count, top frames, duration, correlation IDs
  - **Docs** — usage snippets for all three use-cases

## Requirements

- **Chromium Canary** with experimental flags enabled:
  ```bash
  /Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary \
    --enable-features=DocumentPolicyInDedicatedWorker,ProfilerAPIForDedicatedWorker \
    http://localhost:8081
  ```
- The proxy server sets `Document-Policy: js-profiling` on worker script responses automatically.
- The **blob: URL worker (use-case 3)** additionally requires **Chromium M154+** —
  `Document-Policy` inheritance for `blob:`/`data:` dedicated workers landed upstream in CL
  [7857031](https://chromium-review.googlesource.com/c/chromium/src/+/7857031) ("Inherit and
  apply Document Policy for local-scheme dedicated workers"), merged August 28, 2026. On older
  Canary builds, the worker still runs, but `attachProfiler()` reports a
  `missing-document-policy-header` `dd-worker-error` instead of starting the profiler.

## Running locally

You need **two terminals**:

```bash
# Terminal 1 — webpack dev server (serves the page + worker bundles on port 8081)
cd test/apps/worker-profiling
yarn install
yarn dev

# Terminal 2 — proxy server (captures intake traffic, SSE on port 8082)
cd test/apps/worker-profiling
yarn proxy
```

Open **http://localhost:8081** in Chromium Canary (the proxy is transparent — the page thinks
it is talking directly to the Datadog intake at port 8082).

Profiles from all workers will appear as cards in the middle column, showing sample count,
top frames, duration, and correlation IDs.

## Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │  Browser (Chromium Canary)  port 8081        │
                    │                                              │
                    │  main.ts                                     │
                    │    datadogRum.init({ proxy: 'http://...' })  │
                    │    const detach =                            │
                    │      datadogRum.attachProfilingWorker(worker) │
                    │                                              │
                    │  profilingWorker.ts  (persistent)            │
                    │    attachProfiler()                          │
                    │    + CPU workloads                           │
                    │                                              │
                    │  shortLivedWorker.ts  (burst, self-close)    │
                    │    const { detachProfiler } = attachProfiler()│
                    │    await detachProfiler(); self.close()      │
                    │                                              │
                    │  shortLivedWorkerMainThreadClose.ts          │
                    │    attachProfiler()                          │
                    │    // main thread calls detach() + terminate()│
                    └──────────────┬───────────────────────────────┘
                                   │ POST /proxy?ddforward=...
                                   ▼
                    ┌──────────────────────────────────────────────┐
                    │  proxy-server.ts            port 8082        │
                    │                                              │
                    │  Express + intakeProxyMiddleware             │
                    │    → deflate-decode + unpack FormData        │
                    │    → parse wall-time.json                    │
                    │    → extract top frames, correlation IDs     │
                    │    → broadcast via SSE GET /events           │
                    │                                              │
                    │  also serves /datadog-worker.js              │
                    │    (browser-worker deflate bundle)           │
                    └──────────────────────────────────────────────┘
                                   │ SSE
                                   ▼
                    page displays profile cards live (no Datadog account needed)
```

## SDK API used

### Main thread

```typescript
import { datadogRum } from '@datadog/browser-rum'

const worker = new Worker('/my-worker.js', { name: 'my-worker' })

// Attach the worker to the profiling pipeline.
// Returns a detach function — call it before worker.terminate().
const detach = datadogRum.attachProfilingWorker(worker, { name: 'my-worker' })

// When done:
detach() // flushes the current profiling session
worker.terminate() // you own the worker lifecycle
```

### Worker — use-case 1: main thread controls lifecycle

```typescript
import { attachProfiler } from '@datadog/browser-rum/worker'

attachProfiler()

// ... worker logic ...
// Main thread calls detach() + worker.terminate() when done
```

### Worker — use-case 2: worker controls its own lifecycle

```typescript
import { attachProfiler } from '@datadog/browser-rum/worker'

const { detachProfiler } = attachProfiler()

async function run() {
  await doHeavyComputation()
  await detachProfiler() // detach from the pipeline before exiting
  self.close()
}

run()
```

### Worker — use-case 3: blob: URL worker (no HTTP response of its own)

`attachProfiler()` behaves identically regardless of how the worker was constructed —
network URL, `blob:`, or `data:`. The only thing that changes is where
`Document-Policy: js-profiling` comes from:

| Worker type | `Document-Policy` source |
|---|---|
| Network-loaded (`new Worker('https://...')`) | The worker script's own HTTP response |
| `blob:` / `data:` URL | Inherited from the creator (main) document — **Chromium M154+** |

```typescript
// main.ts — fetch the already-bundled worker script and wrap it in a blob: URL instead
// of loading it from a static file. Useful for CDN-delivered single-file widgets that
// cannot set custom response headers on the worker script itself.
const source = await fetch('/blob-worker.js').then((r) => r.text())
const blobUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))

const worker = new Worker(blobUrl, { name: 'blob-url-worker' })
datadogRum.attachProfilingWorker(worker, { name: 'blob-url-worker' })

URL.revokeObjectURL(blobUrl) // safe once the Worker has been constructed
```

```typescript
// blob-worker.ts — identical to use-case 1/2, unaware of how it was loaded
import { attachProfiler } from '@datadog/browser-rum/worker'

attachProfiler()

// ... your worker logic ...
```

Below Chromium M154, this fails with `missing-document-policy-header` because the browser
doesn't yet inherit `Document-Policy` for local-scheme (`blob:`/`data:`) dedicated workers —
see CL 7857031.

## Worker script HTTP header

Every **network-loaded** worker script response must include:

```
Document-Policy: js-profiling
```

The proxy server (`proxy-server.ts`) adds this header automatically for all `.js` files it
serves. In production you would configure this on your CDN or web server.

For **`blob:`/`data:` URL workers** (use-case 3), no such header exists on the worker itself —
the policy is inherited from the main document instead, which the webpack dev server already
sets (see `webpack.config.cjs` → `devServer.headers`).
