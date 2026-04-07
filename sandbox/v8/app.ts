// === V6 SDK ===
import { datadogLogs } from '@datadog/browser-logs'

// === V8 SDK ===
import { createSdk } from '@datadog/browser-sdk'
import { consoleModule } from '@datadog/browser-console-next'
import { errorsModule } from '@datadog/browser-errors-next'
import { logsModule } from '@datadog/browser-logs-next'

// ─── Request capture via XHR monkey-patch ──────────────────────────────
//
// Both SDKs monkey-patch fetch, so we can't reliably intercept at that
// level. Instead, we hook into XMLHttpRequest (which the v6 SDK uses as
// fallback after sendBeacon) AND we patch fetch at the very beginning
// before any SDK code runs. We save a reference to the real fetch and
// wrap it to capture requests going to /intake/*.

const _realFetch = window.fetch.bind(window)
const _realSendBeacon = navigator.sendBeacon.bind(navigator)

interface CapturedEvent {
  version: 'v6' | 'v8'
  url: string
  body: Record<string, unknown>
  timestamp: number
}

const capturedEvents: CapturedEvent[] = []

function classifyUrl(url: string): 'v6' | 'v8' | null {
  if (url.includes('/intake/v6')) return 'v6'
  if (url.includes('/intake/v8')) return 'v8'
  return null
}

function captureBody(version: 'v6' | 'v8', url: string, body: string) {
  const lines = body.split('\n').filter(Boolean)
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      capturedEvents.push({ version, url, body: parsed, timestamp: Date.now() })
      renderEvent({ version, url, body: parsed, timestamp: Date.now() })
    } catch {
      // not JSON, skip
    }
  }
}

// Patch fetch before SDKs load
window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const version = classifyUrl(url)
  if (version && init?.body) {
    captureBody(version, url, typeof init.body === 'string' ? init.body : '')
  }
  return _realFetch(input, init)
} as typeof fetch

// Patch sendBeacon before SDKs load
navigator.sendBeacon = function (url: string, data?: BodyInit | null): boolean {
  const version = classifyUrl(url)
  if (version && data) {
    const body = typeof data === 'string' ? data : data instanceof Blob ? '' : String(data)
    if (body) {
      captureBody(version, url, body)
    } else if (data instanceof Blob) {
      // Read blob async, render when ready
      data.text().then((text) => captureBody(version, url, text))
    }
  }
  return _realSendBeacon(url, data)
}

// ─── UI rendering ───────────────────────────────────────────────────────

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'number'
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'key' : 'string'
      } else if (/true|false/.test(match)) {
        cls = 'boolean'
      } else if (/null/.test(match)) {
        cls = 'null'
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

function renderEvent(event: CapturedEvent) {
  const container = document.getElementById(`${event.version}-requests`)!
  const countEl = document.getElementById(`${event.version}-count`)!

  const pretty = JSON.stringify(event.body, null, 2)
  const eventDate = (event.body.date as number) ?? event.timestamp
  const time = new Date(eventDate).toISOString().split('T')[1].slice(0, 12)
  const status = (event.body.status as string) ?? '?'
  const origin = (event.body.origin as string) ?? '?'
  const message = (event.body.message as string) ?? ''

  const el = document.createElement('div')
  el.className = 'request'
  el.innerHTML = `
    <div class="request-header">
      <span class="method">[${status}]</span>
      <span class="url">${origin}: ${message.slice(0, 60)}</span>
      <span class="time">${time}</span>
    </div>
    <div class="request-body"><pre>${syntaxHighlight(pretty)}</pre></div>
  `
  el.querySelector('.request-header')!.addEventListener('click', () => {
    el.querySelector('.request-body')!.classList.toggle('open')
  })

  container.prepend(el)

  const count = container.querySelectorAll('.request').length
  countEl.textContent = `${count} event${count === 1 ? '' : 's'}`
}

// ─── Init both SDKs ────────────────────────────────────────────────────

function initV6() {
  const el = document.getElementById('v6-status')!
  try {
    datadogLogs.init({
      clientToken: 'pub_playground_v6',
      site: 'datadoghq.com',
      proxy: (options) => `/intake/v6${options.path}?${options.parameters}`,
      forwardErrorsToLogs: true,
      forwardConsoleLogs: ['log', 'debug', 'info', 'warn', 'error'],
    })
    el.textContent = 'ready'
    el.style.color = '#4CAF50'
  } catch (e) {
    el.textContent = `error: ${e}`
    el.style.color = '#F44336'
  }
}

async function initV8() {
  const el = document.getElementById('v8-status')!
  try {
    const sdk = await createSdk({
      clientToken: 'pub_playground_v8',
      site: 'datadoghq.com',
      proxy: '/intake/v8/api/v2/logs',
      modules: [consoleModule, errorsModule, logsModule],
      logs: {
        forwardErrorsToLogs: true,
        forwardConsoleLogs: 'all' as const,
        forwardReports: 'all' as const,
      },
    })
    if (!sdk) {
      el.textContent = 'init returned null'
      el.style.color = '#F44336'
      return
    }
    ;(window as any).sdkV8 = sdk
    el.textContent = 'ready'
    el.style.color = '#4CAF50'
  } catch (e) {
    el.textContent = `error: ${e}`
    el.style.color = '#F44336'
  }
}

// ─── Button handlers ────────────────────────────────────────────────────

function setupButtons() {
  document.getElementById('btn-info')?.addEventListener('click', () => {
    datadogLogs.logger.info('Test info message', { source: 'playground' })
    const v8 = (window as any).sdkV8?.logs as any
    v8?.logger.info('Test info message', { source: 'playground' })
  })

  document.getElementById('btn-warn')?.addEventListener('click', () => {
    datadogLogs.logger.warn('Test warning message', { source: 'playground' })
    const v8 = (window as any).sdkV8?.logs as any
    v8?.logger.warn('Test warning message', { source: 'playground' })
  })

  document.getElementById('btn-error')?.addEventListener('click', () => {
    datadogLogs.logger.error('Test error message', { source: 'playground' }, new Error('playground error'))
    const v8 = (window as any).sdkV8?.logs as any
    v8?.logger.error('Test error message', { source: 'playground' }, new Error('playground error'))
  })

  document.getElementById('btn-console-error')?.addEventListener('click', () => {
    console.error('Console error from playground')
  })

  document.getElementById('btn-set-context')?.addEventListener('click', () => {
    datadogLogs.setGlobalContext({ env: 'playground', version: '0.0.1' })
    const v8 = (window as any).sdkV8?.logs as any
    v8?.setGlobalContext({ env: 'playground', version: '0.0.1' })
    // Send a log so the context shows up in the payload
    datadogLogs.logger.info('Log after setGlobalContext')
    v8?.logger.info('Log after setGlobalContext')
  })

  document.getElementById('btn-set-user')?.addEventListener('click', () => {
    datadogLogs.setUser({ id: 'user-123', name: 'Test User', email: 'test@example.com' })
    const v8 = (window as any).sdkV8?.logs as any
    v8?.setUser({ id: 'user-123', name: 'Test User', email: 'test@example.com' })
    // Send a log so the user shows up in the payload
    datadogLogs.logger.info('Log after setUser')
    v8?.logger.info('Log after setUser')
  })

  document.getElementById('btn-flush')?.addEventListener('click', () => {
    // Simulate page hide to trigger both SDKs to flush their batches
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    setTimeout(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    }, 200)
  })

  document.getElementById('btn-clear')?.addEventListener('click', () => {
    for (const id of ['v6-requests', 'v8-requests']) {
      document.getElementById(id)!.innerHTML = ''
    }
    for (const id of ['v6-count', 'v8-count']) {
      document.getElementById(id)!.textContent = '0 events'
    }
    capturedEvents.length = 0
  })
}

// ─── Boot ───────────────────────────────────────────────────────────────

setupButtons()
initV6()
initV8().catch(console.error)
