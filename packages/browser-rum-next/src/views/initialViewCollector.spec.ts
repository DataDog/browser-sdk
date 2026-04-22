import { Pipeline } from '@datadog/core-next'
import { startInitialViewCollection } from './initialViewCollector'
import type { NavigationResource } from './types'

describe('startInitialViewCollection', () => {
  it('publishes resource:navigation once with initial_load on start', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const collected: NavigationResource[] = []
    pipeline.subscribe('resource:navigation', (e) => collected.push(e as NavigationResource))
    pipeline.seal()

    startInitialViewCollection(pipeline)
    await new Promise((r) => setTimeout(r, 0))

    expect(collected.length).toBe(1)
    expect(collected[0].loadingType).toBe('initial_load')
    expect(collected[0].url).toBe(window.location.href)
    expect(collected[0].referrer).toBe(document.referrer)
    expect(collected[0].startTime).toBe(0)
    expect(collected[0].startDate).toBe(Math.round(performance.timeOrigin))
  })

  it('returns a cleanup function', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()

    const stop = startInitialViewCollection(pipeline)

    expect(typeof stop).toBe('function')
  })
})
