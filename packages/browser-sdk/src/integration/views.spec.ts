import { createSdk } from '../domain/sdk'
import { viewsProcessor } from '@datadog/browser-views-next/processor'
import { unregisterSdk } from '@datadog/core-next'
import type { ViewsPublicApi } from '@datadog/browser-views-next'

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

  it('initial view: observation:view is sent on SDK init', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"loadingType":"initial_load"')
    expect(body).toContain('"url"')
  })

  it('manual view: startView() sends observation:view with route_change', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    fetchSpy.calls.reset()

    const views = currentSdk!['views'] as ViewsPublicApi
    views.startView('checkout')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    expect(body).toContain('"loadingType":"route_change"')
    expect(body).toContain('"name":"checkout"')
  })

  it('view observation includes session.id from core enricher', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    await tick()
    flushBatch()

    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    const event = JSON.parse(body)
    expect(event.session).toBeDefined()
    expect(typeof event.session.id).toBe('string')
  })

  it('view observation includes global context set via public API', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    const views = currentSdk!['views'] as ViewsPublicApi
    views.setGlobalContext({ deployment: 'canary' })

    fetchSpy.calls.reset()
    views.startView('with-context')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    const lines = body.trim().split('\n')
    const lastEvent = JSON.parse(lines[lines.length - 1])
    expect(lastEvent.deployment).toBe('canary')
  })

  it('view observation includes user context set via public API', async () => {
    currentSdk = await createSdk({
      clientToken: 'test-token',
      site: 'datadoghq.com',
      modules: [viewsProcessor],
      views: {},
    })

    const views = currentSdk!['views'] as ViewsPublicApi
    views.setUser({ id: 'user-42', name: 'Ada' })

    fetchSpy.calls.reset()
    views.startView('with-user')

    await tick()
    flushBatch()

    expect(fetchSpy).toHaveBeenCalled()
    const body = (fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string
    const lines = body.trim().split('\n')
    const lastEvent = JSON.parse(lines[lines.length - 1])
    expect(lastEvent.usr).toEqual(jasmine.objectContaining({ id: 'user-42', name: 'Ada' }))
  })
})
