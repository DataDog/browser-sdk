import { createSdk } from '../domain/sdk'
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import { logsProcessor } from '@datadog/browser-logs-next/processor'
import { datadogRum } from '@datadog/browser-rum-next'
import { unregisterSdk } from '@datadog/core-next'

async function tick(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

function flushBatch(): void {
  const orig = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  if (orig) {
    Object.defineProperty(document, 'visibilityState', orig)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (document as any).visibilityState
  }
}

// Collect all NDJSON lines sent to the RUM endpoint across all fetch calls
function getRumLines(fetchSpy: jasmine.Spy): string[] {
  return fetchSpy.calls
    .all()
    .filter((c) => String(c.args[0]).includes('/api/v2/rum'))
    .flatMap((c) => {
      const body = (c.args[1] as RequestInit).body as string
      return body
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
    })
}

function getLogLines(fetchSpy: jasmine.Spy): string[] {
  return fetchSpy.calls
    .all()
    .filter((c) => String(c.args[0]).includes('/api/v2/logs'))
    .flatMap((c) => {
      const body = (c.args[1] as RequestInit).body as string
      return body
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
    })
}

describe('RUM integration', () => {
  let fetchSpy: jasmine.Spy
  let currentSdk: any

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
    currentSdk = null
    // Prevent Jasmine from failing on uncaught errors dispatched in tests
    spyOn(window as any, 'onerror')
  })

  afterEach(() => {
    currentSdk?.__stop?.()
    unregisterSdk('default')
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as any)._DD_SESSION
  })

  it('observation:error is sent on runtime error', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('test'), message: 'test' }))

    await tick()
    flushBatch()

    const errorLines = getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"'))
    expect(errorLines.length).toBeGreaterThan(0)
  })

  it('addError sends observation:error', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    currentSdk!['rum'].addError(new Error('test'))

    await tick()
    flushBatch()

    const errorLines = getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"'))
    expect(errorLines.length).toBeGreaterThan(0)
  })

  it('RUM observations include view context', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('test'), message: 'test' }))

    await tick()
    flushBatch()

    const errorLines = getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"'))
    expect(errorLines.length).toBeGreaterThan(0)

    const errorEvent = JSON.parse(errorLines[0])
    expect(errorEvent.view).toBeDefined()
    expect(typeof errorEvent.view.id).toBe('string')
  })

  it('logs and RUM coexist: errors go to both endpoints', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [logsProcessor, rumProcessor],
      logs: { forwardErrorsToLogs: true },
      rum: {},
    })

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('coexist'), message: 'coexist' }))

    await tick()
    flushBatch()

    expect(getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"')).length).toBeGreaterThan(0)
    expect(getLogLines(fetchSpy).length).toBeGreaterThan(0)
  })

  it('manual addAction sends observation:action to RUM endpoint', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    datadogRum.addAction('checkout')

    await tick()
    flushBatch()

    const actionLines = getRumLines(fetchSpy).filter((l) => l.includes('"type":"action"'))
    expect(actionLines.length).toBeGreaterThan(0)
    const actionEvent = JSON.parse(actionLines[0])
    expect(actionEvent.action).toBeDefined()
    expect(actionEvent.action.target.name).toBe('checkout')
    expect(actionEvent.action.type).toBe('custom')
  })

  it('initializes with tracing config without errors', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {
        allowedTracingUrls: ['https://api.example.com'],
        traceSampleRate: 100,
      },
    })

    await tick()
    flushBatch()

    // SDK initialized successfully, view events are still sent
    const rumLines = getRumLines(fetchSpy)
    expect(rumLines.length).toBeGreaterThan(0)
  })

  it('addAction increments view action count', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    // Flush initial view
    await tick()
    flushBatch()
    fetchSpy.calls.reset()

    datadogRum.addAction('buy')

    await tick()
    flushBatch()

    const viewLines = getRumLines(fetchSpy).filter((l) => l.includes('"loading_type"'))
    expect(viewLines.length).toBeGreaterThan(0)
    const viewEvent = JSON.parse(viewLines[viewLines.length - 1])
    expect(viewEvent.view?.action).toBeDefined()
    expect(viewEvent.view.action.count).toBeGreaterThanOrEqual(1)
  })
})
