import { Pipeline } from '@datadog/core-next'
import { startNavigationCollection } from './navigationCollector'
import type { NavigationResource } from './types'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startNavigationCollection', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let collected: NavigationResource[]
  let stop: () => void

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:navigation', (e) => collected.push(e as NavigationResource))
    pipeline.seal()
  })

  afterEach(() => {
    stop?.()
  })

  it('publishes route_change when pathname changes via pushState', async () => {
    stop = startNavigationCollection(pipeline)
    const originalHref = window.location.href

    history.pushState({}, '', '/new-path')
    await tick()

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('route_change')
    expect(collected[0].url).toContain('/new-path')
    expect(collected[0].referrer).toBe(originalHref)

    history.pushState({}, '', '/')
  })

  it('does not publish when only query string changes via pushState', async () => {
    stop = startNavigationCollection(pipeline)

    history.pushState({}, '', '?foo=bar')
    await tick()

    expect(collected.length).toBe(0)

    history.pushState({}, '', '/')
  })

  it('publishes route_change on popstate when pathname changes', async () => {
    history.pushState({}, '', '/page-a')
    history.pushState({}, '', '/page-b')
    stop = startNavigationCollection(pipeline)

    history.back()
    await tick()

    // popstate fires asynchronously — wait a bit
    await new Promise((r) => setTimeout(r, 100))

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('route_change')

    history.pushState({}, '', '/')
  })

  it('publishes bf_cache on pageshow with persisted=true', async () => {
    stop = startNavigationCollection(pipeline)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await tick()

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('bf_cache')
  })

  it('does not publish on pageshow with persisted=false', async () => {
    stop = startNavigationCollection(pipeline)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    await tick()

    expect(collected.length).toBe(0)
  })

  it('publishes route_change when pathname changes via replaceState', async () => {
    stop = startNavigationCollection(pipeline)
    const originalHref = window.location.href

    history.replaceState({}, '', '/replaced-path')
    await tick()

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('route_change')
    expect(collected[0].url).toContain('/replaced-path')
    expect(collected[0].referrer).toBe(originalHref)

    history.pushState({}, '', '/')
  })

  it('restores original pushState and replaceState on stop', () => {
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState
    stop = startNavigationCollection(pipeline)
    expect(history.pushState).not.toBe(originalPushState)
    expect(history.replaceState).not.toBe(originalReplaceState)

    stop()
    expect(history.pushState).toBe(originalPushState)
    expect(history.replaceState).toBe(originalReplaceState)
  })
})
