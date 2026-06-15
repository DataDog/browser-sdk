/**
 * Worker Profiling — test app main thread
 *
 * Demonstrates:
 *  1. Initializing Datadog RUM with profilingSampleRate: 100
 *  2. Spawning a dedicated worker that runs a CPU-intensive workload
 *  3. Registering the worker with datadogRum.addProfilingWorker()
 *  4. Displaying live stats from the worker on the page
 */
import { datadogRum } from '@datadog/browser-rum'

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
  // Send everything to a local no-op proxy so no real data leaves the machine
  proxy: '/dev-null',
})

// ---------------------------------------------------------------------------
// Worker bootstrap
// ---------------------------------------------------------------------------
const worker = new Worker('/worker.js', { name: 'cpu-workload-worker' })

datadogRum.addProfilingWorker(worker, { name: 'cpu-workload-worker' })

// ---------------------------------------------------------------------------
// Stats display
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
  // Ignore dd- messages from the Datadog shim
  if (typeof event.data === 'object' && typeof event.data.type === 'string' && (event.data.type as string).startsWith('dd-')) {
    return
  }
  if (event.data && event.data.kind === 'stats') {
    updateStats(event.data as WorkerStats & { kind: string })
  }
})

worker.addEventListener('error', (event: ErrorEvent) => {
  console.error('[main] Worker error:', event.message)
  document.getElementById('worker-status')!.textContent = `❌ Worker error: ${event.message}`
  document.getElementById('worker-status')!.style.color = '#e55353'
})

// Tell the worker to start its workload
worker.postMessage({ kind: 'start' })

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
document.getElementById('btn-stop')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'stop' })
  datadogRum.removeProfilingWorker(worker)
  document.getElementById('worker-status')!.textContent = '⏹ Worker stopped'
  document.getElementById('worker-status')!.style.color = '#888'
  ;(document.getElementById('btn-stop') as HTMLButtonElement).disabled = true
  ;(document.getElementById('btn-restart') as HTMLButtonElement).disabled = false
})

document.getElementById('btn-restart')!.addEventListener('click', () => {
  worker.postMessage({ kind: 'start' })
  datadogRum.addProfilingWorker(worker, { name: 'cpu-workload-worker' })
  document.getElementById('worker-status')!.textContent = '🟢 Worker running'
  document.getElementById('worker-status')!.style.color = '#2da44e'
  ;(document.getElementById('btn-stop') as HTMLButtonElement).disabled = false
  ;(document.getElementById('btn-restart') as HTMLButtonElement).disabled = true
})
