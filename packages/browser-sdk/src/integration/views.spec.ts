import { createSdk } from '../domain/sdk'
import { rumProcessor } from '@datadog/browser-rum-next/processor'
import type { RumPublicApi } from '@datadog/browser-rum-next/processor'
import { unregisterSdk } from '@datadog/core-next'


function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function flushBatch(): void {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  if (originalVisibilityState) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (document as any).visibilityState
  }
}

describe('views integration', () => {
  let fetchSpy: jasmine.Spy
  let currentSdk: any

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })))
    currentSdk = null
  })

  afterEach(() => {
    currentSdk?.__stop?.()
    unregisterSdk('default')
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as any)._DD_SESSION
  })

  function getRumLines(): string[] {
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

  function getRumBody(): string {
    const lines = getRumLines()
    expect(lines.length).toBeGreaterThan(0)
    return lines.join('\n')
  }

  function getViewLines(): string[] {
    return getRumLines().filter((l) => l.includes('"loading_type"'))
  }

  it('initial view: observation:view is sent on SDK init', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    expect(viewLines[0]).toContain('"loading_type":"initial_load"')
    expect(viewLines[0]).toContain('"url"')
  })

  it('manual view: startView() sends observation:view with route_change', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    // Flush the initial view first so it doesn't pollute the assertions below
    await tick()
    flushBatch()
    fetchSpy.calls.reset()

    const rum = currentSdk!['rum'] as RumPublicApi
    rum.startView('checkout')

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    const routeChangeLines = viewLines.filter((l) => l.includes('"loading_type":"route_change"'))
    expect(routeChangeLines.length).toBeGreaterThan(0)
    expect(routeChangeLines[0]).toContain('"name":"checkout"')
  })

  it('view observation includes session.id from core enricher', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    const event = JSON.parse(viewLines[0])
    expect(event.session).toBeDefined()
    expect(typeof event.session.id).toBe('string')
  })

  it('view observation includes global context set via public API', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()
    fetchSpy.calls.reset()

    ;(currentSdk as any).setGlobalContext({ deployment: 'canary' })
    const rum = currentSdk!['rum'] as RumPublicApi
    rum.startView('with-context')

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    const event = JSON.parse(viewLines[0])
    expect(event.deployment).toBe('canary')
  })

  it('view observation includes user context set via public API', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()
    fetchSpy.calls.reset()

    ;(currentSdk as any).setUser({ id: 'user-42', name: 'Ada' })
    const rum = currentSdk!['rum'] as RumPublicApi
    rum.startView('with-user')

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    const event = JSON.parse(viewLines[0])
    expect(event.usr).toEqual(jasmine.objectContaining({ id: 'user-42', name: 'Ada' }))
  })

  it('view observation includes documentVersion >= 1', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    const event = JSON.parse(viewLines[0])
    expect(typeof event._dd.document_version).toBe('number')
    expect(event._dd.document_version).toBeGreaterThanOrEqual(1)
  })

  it('view observation includes isActive true for the current view', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)
    const event = JSON.parse(viewLines[0])
    expect(event.view.is_active).toBe(true)
  })

  it('multiple view observations may be emitted with increasing documentVersion', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    // Give extra time for buffered PerformanceObserver entries to fire
    await tick()
    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)

    // All view events must have valid documentVersion and isActive fields
    for (const line of viewLines) {
      const event = JSON.parse(line)
      expect(typeof event._dd.document_version).toBe('number')
      expect(event._dd.document_version).toBeGreaterThanOrEqual(1)
      expect(typeof event.view.is_active).toBe('boolean')
    }

    // If multiple events arrived, documentVersions must be monotonically increasing
    if (viewLines.length > 1) {
      const versions = viewLines.map((l) => JSON.parse(l)._dd.document_version as number)
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1])
      }
    }
  })

  it('previous view is finalized (isActive: false) when a new view starts', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [rumProcessor],
      rum: {},
    })

    await tick()
    flushBatch()
    fetchSpy.calls.reset()

    const rum = currentSdk!['rum'] as RumPublicApi
    rum.startView('page2')

    await tick()
    flushBatch()

    const viewLines = getViewLines()
    expect(viewLines.length).toBeGreaterThan(0)

    const events = viewLines.map((l) => JSON.parse(l))
    const finalizedView = events.find((e: any) => e.view?.is_active === false)
    expect(finalizedView).toBeDefined()
  })
})
