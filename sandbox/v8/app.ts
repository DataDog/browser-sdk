// === V6 SDK ===
import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

// === V8 SDK ===
import { createSdk } from '@datadog/browser-sdk'
import { logsProcessor } from '@datadog/browser-logs-next/processor'
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import type { RumPublicApi } from '@datadog/browser-rum-next/processor'

// ─── Request capture ────────────────────────────────────────────────────

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
    const body = init.body
    if (typeof body === 'string') {
      captureBody(version, url, body)
    } else if (body instanceof Blob) {
      body.text().then((text) => captureBody(version, url, text))
    }
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

function getEventSummary(body: Record<string, unknown>): { tag: string; tagColor: string; label: string } {
  // V8 view event (has loadingType at top level)
  if (body.loadingType) {
    const loadingType = body.loadingType as string
    const url = (body.url as string) ?? ''
    const name = (body.name as string) ?? ''
    const pathname = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return url
      }
    })()
    return {
      tag: loadingType,
      tagColor: loadingType === 'initial_load' ? '#2196f3' : loadingType === 'bf_cache' ? '#ff9800' : '#9c27b0',
      label: name ? `${pathname} (${name})` : pathname,
    }
  }
  // V6 view event (has type: "view" and a nested view object)
  if (body.type === 'view') {
    const view = (body.view as Record<string, unknown>) ?? {}
    const loadingType = (view.loading_type as string) ?? 'route_change'
    const url = (view.url as string) ?? ''
    const name = (view.name as string) ?? ''
    const pathname = (() => {
      try {
        return new URL(url).pathname
      } catch {
        return url
      }
    })()
    return {
      tag: loadingType,
      tagColor: loadingType === 'initial_load' ? '#2196f3' : loadingType === 'bf_cache' ? '#ff9800' : '#9c27b0',
      label: name ? `${pathname} (${name})` : pathname,
    }
  }
  // Log event
  const status = (body.status as string) ?? '?'
  const origin = (body.origin as string) ?? '?'
  const message = (body.message as string) ?? ''
  return {
    tag: status,
    tagColor: status === 'error' ? '#f44336' : status === 'warn' ? '#ff9800' : '#4caf50',
    label: `${origin}: ${message.slice(0, 60)}`,
  }
}

function isInteresting(body: Record<string, unknown>): boolean {
  // Skip v6 RUM resource/action/long_task events — too noisy, not relevant for this comparison
  if (body.type === 'resource' || body.type === 'action' || body.type === 'long_task') return false
  return true
}

function renderEvent(event: CapturedEvent) {
  if (!isInteresting(event.body)) return
  const container = document.getElementById(`${event.version}-requests`)!
  const countEl = document.getElementById(`${event.version}-count`)!

  const pretty = JSON.stringify(event.body, null, 2)
  const eventDate = (event.body.date as number) ?? event.timestamp
  const time = new Date(eventDate).toISOString().split('T')[1].slice(0, 12)
  const { tag, tagColor, label } = getEventSummary(event.body)

  const el = document.createElement('div')
  el.className = 'request'
  el.innerHTML = `
    <div class="request-header">
      <span class="method" style="color: ${tagColor}">[${tag}]</span>
      <span class="url">${label}</span>
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
    datadogRum.init({
      clientToken: 'pub_playground_v6',
      applicationId: 'playground-app-v6',
      site: 'datadoghq.com',
      proxy: (options) => `/intake/v6${options.path}?${options.parameters}`,
      trackViewsManually: false,
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
      proxy: (options: { path: string; parameters: string }) =>
        `/intake/v8${options.path}?${options.parameters}`,
      modules: [logsProcessor, rumProcessor],
      logs: {
        forwardErrorsToLogs: true,
        forwardConsoleLogs: 'all' as const,
        forwardReports: 'all' as const,
      },
      rum: {},
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
  // ── Logs ──
  document.getElementById('btn-info')?.addEventListener('click', () => {
    datadogLogs.logger.info('Test info message', { source: 'playground' })
    const v8Logs = (window as any).sdkV8?.logs as any
    v8Logs?.logger.info('Test info message', { source: 'playground' })
  })

  document.getElementById('btn-warn')?.addEventListener('click', () => {
    datadogLogs.logger.warn('Test warning message', { source: 'playground' })
    const v8Logs = (window as any).sdkV8?.logs as any
    v8Logs?.logger.warn('Test warning message', { source: 'playground' })
  })

  document.getElementById('btn-error')?.addEventListener('click', () => {
    datadogLogs.logger.error('Test error message', { source: 'playground' }, new Error('playground error'))
    const v8Logs = (window as any).sdkV8?.logs as any
    v8Logs?.logger.error('Test error message', { source: 'playground' }, new Error('playground error'))
  })

  document.getElementById('btn-console-error')?.addEventListener('click', () => {
    console.error('Console error from playground')
  })

  document.getElementById('btn-set-context')?.addEventListener('click', () => {
    datadogLogs.setGlobalContext({ env: 'playground', version: '0.0.1' })
    // v8: context methods are SDK-level, not module-level
    const v8Sdk = (window as any).sdkV8
    v8Sdk?.setGlobalContext({ env: 'playground', version: '0.0.1' })
    datadogLogs.logger.info('Log after setGlobalContext')
    const v8Logs = (window as any).sdkV8?.logs as any
    v8Logs?.logger.info('Log after setGlobalContext')
  })

  document.getElementById('btn-set-user')?.addEventListener('click', () => {
    datadogLogs.setUser({ id: 'user-123', name: 'Test User', email: 'test@example.com' })
    // v8: context methods are SDK-level
    const v8Sdk = (window as any).sdkV8
    v8Sdk?.setUser({ id: 'user-123', name: 'Test User', email: 'test@example.com' })
    datadogLogs.logger.info('Log after setUser')
    const v8Logs = (window as any).sdkV8?.logs as any
    v8Logs?.logger.info('Log after setUser')
  })

  // ── Views ──
  document.getElementById('btn-start-view')?.addEventListener('click', () => {
    datadogRum.startView({ name: 'manual-view' })
    const v8Rum = (window as any).sdkV8?.rum as RumPublicApi | undefined
    v8Rum?.startView('manual-view')
  })

  document.getElementById('btn-navigate-a')?.addEventListener('click', () => {
    history.pushState({}, '', '/page-a')
  })

  document.getElementById('btn-navigate-b')?.addEventListener('click', () => {
    history.pushState({}, '', '/page-b')
  })

  document.getElementById('btn-navigate-back')?.addEventListener('click', () => {
    history.back()
  })

  // ── Shared ──
  document.getElementById('btn-flush')?.addEventListener('click', () => {
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
