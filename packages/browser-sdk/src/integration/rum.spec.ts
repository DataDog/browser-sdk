import { createSdk } from '../domain/sdk'
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import { viewsProcessor } from '@datadog/browser-views-next/processor'
import { logsProcessor } from '@datadog/browser-logs-next/processor'
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

  it('observation:rum_error is sent on runtime error', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor, viewsProcessor],
      rum: {},
      views: {},
    })

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('test'), message: 'test' }))

    await tick()
    flushBatch()

    const errorLines = getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"'))
    expect(errorLines.length).toBeGreaterThan(0)
  })

  it('addError sends observation:rum_error', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor, viewsProcessor],
      rum: {},
      views: {},
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
      modules: [rumProcessor, viewsProcessor],
      rum: {},
      views: {},
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
      modules: [logsProcessor, rumProcessor, viewsProcessor],
      logs: { forwardErrorsToLogs: true },
      rum: {},
      views: {},
    })

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('coexist'), message: 'coexist' }))

    await tick()
    flushBatch()

    expect(getRumLines(fetchSpy).filter((l) => l.includes('"type":"error"')).length).toBeGreaterThan(0)
    expect(getLogLines(fetchSpy).length).toBeGreaterThan(0)
  })
})
