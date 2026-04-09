import { Pipeline } from '@datadog/core-next'
import { navigationEnricher } from './navigationEnricher'

describe('navigationEnricher', () => {
  it('adds a viewId string to resource:navigation events', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('resource:navigation', navigationEnricher())
    pipeline.subscribe('resource:navigation', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    pipeline.publish('resource:navigation', {
      url: 'http://example.com/',
      startTime: 0,
      startDate: Date.now(),
      referrer: '',
      loadingType: 'initial_load',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(enriched.length).toBe(1)
    expect(typeof enriched[0].id).toBe('string')
    expect((enriched[0].id as string).length).toBeGreaterThan(0)
  })

  it('adds a different viewId for each event', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('resource:navigation', navigationEnricher())
    pipeline.subscribe('resource:navigation', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    const nav = {
      url: 'http://example.com/',
      startTime: 0,
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change' as const,
    }
    pipeline.publish('resource:navigation', nav)
    pipeline.publish('resource:navigation', nav)
    await new Promise((r) => setTimeout(r, 0))

    expect(enriched[0].id).not.toBe(enriched[1].id)
  })

  it('adds viewId to action:start_view events too', async () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const enriched: Record<string, unknown>[] = []

    pipeline.enrich('action:start_view', navigationEnricher())
    pipeline.subscribe('action:start_view', (e) => enriched.push(e as Record<string, unknown>))
    pipeline.seal()

    pipeline.publish('action:start_view', {
      url: 'http://example.com/',
      startTime: performance.now(),
      startDate: Date.now(),
      referrer: '',
      loadingType: 'route_change' as const,
      name: 'checkout',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(typeof enriched[0].id).toBe('string')
  })
})
