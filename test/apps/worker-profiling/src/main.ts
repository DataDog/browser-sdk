/**
 * Worker Profiling — test app main thread
 *
 * Demonstrates:
 *  1. Initializing Datadog RUM with profilingSampleRate: 100
 *  2. Spawning a dedicated worker that runs a CPU-intensive workload
 *  3. Registering the worker with datadogRum.addProfilingWorker()
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
  workerUrl: `${PROXY_ORIGIN}/datadog-worker.js`,
  // All intake traffic goes to the local proxy server so nothing leaves the machine
  proxy: `${PROXY_ORIGIN}/proxy`,
})

// ---------------------------------------------------------------------------
// Worker bootstrap
// ---------------------------------------------------------------------------
const worker = new Worker('/worker.js', { name: 'cpu-workload-worker' })

datadogRum.addProfilingWorker(worker, { name: 'cpu-workload-worker' })

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
// Controls
// ---------------------------------------------------------------------------
function setWorkerStatus(text: string, color: string): void {
  const el = document.getElementById('worker-status')!
  el.textContent = text
  el.style.color = color
}

document.getElementById('btn-stop')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'stop' })
  datadogRum.removeProfilingWorker(worker)
  setWorkerStatus('⏹ Worker stopped', '#888')
  ;(document.getElementById('btn-stop') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-restart') as HTMLButtonElement).disabled = false
})

document.getElementById('btn-restart')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'start' })
  datadogRum.addProfilingWorker(worker, { name: 'cpu-workload-worker' })
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
    // Retry after 3s
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

  const card = document.createElement('div')
  card.className = 'profile-card'
  card.innerHTML = `
    <div class="profile-header">
      <span class="thread-badge" style="color:${threadColor}">${threadLabel}</span>
      <span class="profile-meta">#${profileCount} · ${time} · ${duration}s</span>
    </div>
    <div class="profile-stats">
      <div class="pstat"><span class="pstat-label">Samples</span><span class="pstat-value">${p.sampleCount.toLocaleString()}</span></div>
      <div class="pstat"><span class="pstat-label">Frames</span><span class="pstat-value">${p.frameCount.toLocaleString()}</span></div>
      <div class="pstat"><span class="pstat-label">Duration</span><span class="pstat-value">${duration}s</span></div>
      <div class="pstat"><span class="pstat-label">Session</span><span class="pstat-value session-id">${p.sessionId ? p.sessionId.slice(0, 8) + '…' : '—'}</span></div>
    </div>
    ${p.correlationIds.length || !isWorker ? `
    <div class="correl-row">
      <span class="correl-label">${isWorker ? 'correlation id' : 'worker correlation ids'}</span>
      ${correlIdsHtml}
    </div>` : ''}
    <div class="frames-section">
      <div class="frames-header">Top frames (by sample count)</div>
      ${framesHtml || '<span style="color:#8b949e;font-size:.8rem">no frames</span>'}
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
