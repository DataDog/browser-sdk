# Worker Profiling — Test App

A self-contained single-page app that demonstrates Datadog's experimental web worker CPU
profiling feature (PROF-15093).

## What it does

- Initialises Datadog RUM with `profilingSampleRate: 100`
- Spawns a **dedicated worker** (`profilingWorker.ts`) that runs four CPU-intensive workloads
  in a tight loop (sieve of Eratosthenes, recursive Fibonacci, matrix multiplication, Mandelbrot set)
- Registers the worker with `datadogRum.addProfilingWorker(worker)`
- Points the SDK proxy at a local **proxy server** (`proxy-server.ts`) that:
  - Intercepts all intake requests (profile + RUM) without forwarding them to Datadog
  - Parses each profile payload using the existing E2E `intakeProxyMiddleware`
  - Streams a summary to the browser page via **SSE** (`GET /events`)
- The page displays captured profiles in real time (thread, samples, top frames, correlation IDs)

## Requirements

- **Chromium Canary** with experimental flags enabled:
  ```
  --enable-features=DocumentPolicyInDedicatedWorker,ProfilerAPIForDedicatedWorker
  ```
  or equivalently:
  ```
  --enable-experimental-web-platform-features
  ```

## Running locally

You need **two terminals**:

```bash
# Terminal 1 — webpack dev server (serves the page + worker bundle on port 8081)
cd test/apps/worker-profiling
yarn install
yarn dev

# Terminal 2 — proxy server (captures intake traffic, SSE on port 8082)
cd test/apps/worker-profiling
yarn proxy
```

Open **http://localhost:8081** in Chromium Canary with the flags above.

Profiles captured from both the main thread and the worker will appear on the right side
of the page, showing sample counts, top frames, duration, and correlation IDs.

## Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │  Browser (Chromium Canary)  port 8081        │
                    │                                              │
                    │  main.ts ──── datadogRum.init({ proxy: ... })│
                    │            ├─ new Worker('/worker.js')        │
                    │            └─ addProfilingWorker(worker)      │
                    │                                              │
                    │  profilingWorker.ts                          │
                    │    ├─ connectDatadogWorker()  ← Datadog shim │
                    │    └─ sieve / fib / matmul / mandelbrot      │
                    └──────────────┬───────────────────────────────┘
                                   │ POST /proxy?ddforward=...
                                   ▼
                    ┌──────────────────────────────────────────────┐
                    │  proxy-server.ts            port 8082        │
                    │                                              │
                    │  createIntakeProxyMiddleware                 │
                    │    → parses FormData (profile event + trace) │
                    │    → extracts top frames, correlation IDs    │
                    │    → broadcasts via SSE GET /events          │
                    └──────────────────────────────────────────────┘
                                   │ SSE
                                   ▼
                    page displays profile cards live (no Datadog account needed)
```
