/**
 * Worker Profiling — test app main thread
 *
 * Demonstrates:
 *  1. Initializing Datadog RUM with profilingSampleRate: 100
 *  2. Spawning a dedicated worker that runs a CPU-intensive workload
 *  3. Registering the worker with datadogRum.registerProfilingWorker()
 *  4. Displaying live stats from the worker on the page
 *  5. Displaying captured profiles received from the proxy server via SSE
 */
import { datadogRum } from '@datadog/browser-rum'

const PROXY_ORIGIN = 'http://localhost:8082'

// ---------------------------------------------------------------------------
// RUM init
// ---------------------------------------------------------------------------
datadogRum.init({
  clientToken: 'pub0000000000000000000000000000000',
  applicationId: '00000000-0000-0000-0000-000000000000',
  site: 'datadoghq.com',
  service: 'worker-profiling-test',
  env: 'dev',
  version: '1.0.0',
  sessionSampleRate: 100,
  profilingSampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
  // Use the locally-built deflate worker (served by webpack-dev-middleware)
  workerUrl: '/datadog-worker.js', // proxied through webpack-dev-server → port 8082
  // All intake traffic goes to the local proxy server so nothing leaves the machine
  proxy: `${PROXY_ORIGIN}/proxy`,
})

// ---------------------------------------------------------------------------
// Persistent worker (Pattern A)
//
// registerProfilingWorker() returns an unregister function.
// Call it when done — SDK flushes the session. You still control terminate().
// ---------------------------------------------------------------------------
const worker = new Worker('/worker.js', { name: 'cpu-workload-worker' })
let unregisterWorker = datadogRum.registerProfilingWorker(worker, { name: 'cpu-workload-worker' })

// ---------------------------------------------------------------------------
// Worker stats display
// ---------------------------------------------------------------------------
interface WorkerStats {
  iterations: number
  primesFound: number
  fibResult: number
  matrixOps: number
  elapsedSeconds: number
}

function updateStats(stats: WorkerStats): void {
  const el = (id: string) => document.getElementById(id)!
  el('stat-iterations').textContent = stats.iterations.toLocaleString()
  el('stat-primes').textContent = stats.primesFound.toLocaleString()
  el('stat-fib').textContent = stats.fibResult.toLocaleString()
  el('stat-matrix-ops').textContent = stats.matrixOps.toLocaleString()
  el('stat-elapsed').textContent = stats.elapsedSeconds.toFixed(1) + 's'
}

worker.addEventListener('message', (event: MessageEvent) => {
  if (typeof event.data === 'object' && typeof event.data.type === 'string' && (event.data.type as string).startsWith('dd-')) {
    return
  }
  if (event.data?.kind === 'stats') {
    updateStats(event.data as WorkerStats & { kind: string })
  }
})

worker.addEventListener('error', (event: ErrorEvent) => {
  console.error('[main] Worker error:', event.message)
  setWorkerStatus(`❌ Worker error: ${event.message}`, '#e55353')
})

worker.postMessage({ kind: 'start' })

// ---------------------------------------------------------------------------
// Short-lived workers — two variants, alternating every 30s
//
// Variant A (self-close): worker calls stop() then self.close() itself
// Variant B (main-close): main thread unregisters after 5s, then terminates
// ---------------------------------------------------------------------------
const SHORT_LIVED_INTERVAL_MS = 30_000
let shortLivedCount = 0

function spawnShortLivedWorker(): void {
  shortLivedCount++
  const variant = shortLivedCount % 2 === 1 ? 'self-close' : 'main-close'
  const name = `burst-${variant}-${shortLivedCount}`
  const script = variant === 'self-close' ? '/short-lived-worker.js' : '/short-lived-worker-main-close.js'
  console.log(`[main] spawning ${name} (variant: ${variant})`)

  const w = new Worker(script, { name })
  const unregister = datadogRum.registerProfilingWorker(w, { name })

  if (variant === 'main-close') {
    // Variant B: main thread decides when to stop after 5s.
    // unregister() flushes the current profile session, then we terminate ourselves.
    setTimeout(() => {
      console.log(`[main] unregistering ${name} and terminating`)
      unregister()
      w.terminate()
      updateShortLivedStatus()
    }, 5_000)
  } else {
    // Variant A: worker calls stop() + self.close() itself after 5s — nothing to do here.
    updateShortLivedStatus()
  }

  w.addEventListener('error', (e: ErrorEvent) => {
    console.error(`[main] ${name} error:`, e.message)
    unregister()
  })
}

function updateShortLivedStatus(): void {
  document.getElementById('stat-burst-count')!.textContent = String(shortLivedCount)
}

// Spawn one immediately, then every 30s
spawnShortLivedWorker()
setInterval(spawnShortLivedWorker, SHORT_LIVED_INTERVAL_MS)

// ---------------------------------------------------------------------------
// Controls — Stop/Restart the persistent worker
// ---------------------------------------------------------------------------
function setWorkerStatus(text: string, color: string): void {
  const el = document.getElementById('worker-status')!
  el.textContent = text
  el.style.color = color
}

document.getElementById('btn-stop')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'stop' })
  unregisterWorker()
  setWorkerStatus('⏹ Worker stopped', '#888')
  ;(document.getElementById('btn-stop') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-restart') as HTMLButtonElement).disabled = false
})

document.getElementById('btn-restart')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'start' })
  unregisterWorker = datadogRum.registerProfilingWorker(worker, { name: 'cpu-workload-worker' })
  setWorkerStatus('🟢 Worker running', '#2da44e')
  ;(document.getElementById('btn-stop') as HTMLButtonElement).disabled = false
  ;(document.getElementById('btn-restart') as HTMLButtonElement).disabled = true
})

// ---------------------------------------------------------------------------
// SSE — receive captured profiles from the proxy server
// ---------------------------------------------------------------------------
interface TopFrame {
  name: string
  resource: string | undefined
  line: number | undefined
  count: number
}

interface ProfileEvent {
  type: 'profile'
  thread: 'main' | 'worker'
  workerName: string | undefined
  correlationIds: string[]
  startTime: string
  endTime: string
  durationMs: number
  sampleCount: number
  frameCount: number
  topFrames: TopFrame[]
  sessionId: string | undefined
  tags: string
}

interface RumEvent {
  type: 'rum'
  eventCount: number
}

type ProxyEvent = ProfileEvent | RumEvent

const profileList = document.getElementById('profile-list')!
const proxyStatus = document.getElementById('proxy-status')!
let profileCount = 0

function connectSSE(): void {
  const es = new EventSource(`${PROXY_ORIGIN}/events`)

  es.onopen = () => {
    proxyStatus.textContent = '🟢 Connected to proxy'
    proxyStatus.style.color = '#2da44e'
  }

  es.onerror = () => {
    proxyStatus.textContent = '🔴 Proxy disconnected — is proxy-server running? (yarn proxy)'
    proxyStatus.style.color = '#e55353'
    es.close()
    setTimeout(connectSSE, 3000)
  }

  es.onmessage = (event) => {
    const data = JSON.parse(event.data) as ProxyEvent
    if (data.type === 'profile') {
      renderProfile(data)
    }
  }
}

connectSSE()

function renderProfile(p: ProfileEvent): void {
  profileCount++

  const isWorker = p.thread === 'worker'
  const threadLabel = isWorker
    ? `🔧 Worker${p.workerName ? ` — ${p.workerName}` : ''}`
    : '🖥 Main thread'
  const threadColor = isWorker ? '#f0883e' : '#58a6ff'

  const time = new Date(p.startTime).toLocaleTimeString()
  const duration = (p.durationMs / 1000).toFixed(1)

  const framesHtml = p.topFrames
    .map(
      (f) =>
        `<div class="frame-row">
          <span class="frame-count">${f.count}</span>
          <span class="frame-name">${escHtml(f.name)}</span>
          ${f.resource ? `<span class="frame-resource">${escHtml(shortUrl(f.resource))}${f.line ? `:${f.line}` : ''}</span>` : ''}
        </div>`
    )
    .join('')

  const correlIdsHtml = p.correlationIds.length
    ? p.correlationIds.map((id) => `<code class="correl-id">${id.slice(0, 8)}…</code>`).join(' ')
    : '<span style="color:#8b949e">none</span>'

  const card: HTMLDetailsElement = document.createElement('details')
  card.className = 'profile-card'
  card.innerHTML = `
    <summary class="profile-summary">
      <div class="profile-summary-left">
        <span class="profile-chevron">▶</span>
        <span class="thread-badge" style="color:${threadColor}">${threadLabel}</span>
      </div>
      <span class="profile-meta">#${profileCount} · ${time} · ${duration}s</span>
    </summary>
    <div class="profile-body">
      <div class="profile-stats">
        <div class="pstat"><span class="pstat-label">Samples</span><span class="pstat-value">${p.sampleCount.toLocaleString()}</span></div>
        <div class="pstat"><span class="pstat-label">Frames</span><span class="pstat-value">${p.frameCount.toLocaleString()}</span></div>
        <div class="pstat"><span class="pstat-label">Duration</span><span class="pstat-value">${duration}s</span></div>
        <div class="pstat"><span class="pstat-label">Session</span><span class="pstat-value session-id">${p.sessionId ? p.sessionId.slice(0, 8) + '…' : '—'}</span></div>
      </div>
      ${
        p.correlationIds.length || !isWorker
          ? `
      <div class="correl-row">
        <span class="correl-label">${isWorker ? 'correlation id' : 'worker correlation ids'}</span>
        ${correlIdsHtml}
      </div>`
          : ''
      }
      <div class="frames-section">
        <div class="frames-header">Top frames (by sample count)</div>
        ${framesHtml || '<span style="color:#8b949e;font-size:.8rem">no frames</span>'}
      </div>
    </div>
  `

  // Newest first
  profileList.insertBefore(card, profileList.firstChild)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/')
    return parts[parts.length - 1] || url
  } catch {
    return url
  }
}
