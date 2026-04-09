import { Pipeline } from '@datadog/core-next'
import { startProcessor } from './processor'
import type { ViewObservation, ViewChangedSignal } from '../types'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('startProcessor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let observations: ViewObservation[]
  let signals: ViewChangedSignal[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    observations = []
    signals = []
    pipeline.subscribe('observation:view', (e) => observations.push(e as ViewObservation))
    pipeline.subscribe('signal:view_changed', (e) => signals.push(e as ViewChangedSignal))
    startProcessor(pipeline)
    pipeline.seal()
  })

  it('publishes observation:view from resource:navigation', async () => {
    pipeline.publish('resource:navigation', {
      id: 'view-1',
      url: 'http://example.com/home',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'initial_load',
    })
    await tick()

    expect(observations.length).toBe(1)
    expect(observations[0].id).toBe('view-1')
    expect(observations[0].url).toBe('http://example.com/home')
    expect(observations[0].loadingType).toBe('initial_load')
    expect(observations[0].startTime).toBe(0)
    expect(observations[0].startDate).toBe(1000)
  })

  it('publishes signal:view_changed from resource:navigation', async () => {
    pipeline.publish('resource:navigation', {
      id: 'view-abc',
      url: 'http://example.com/',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'initial_load',
    })
    await tick()

    expect(signals.length).toBe(1)
    expect(signals[0].viewId).toBe('view-abc')
  })

  it('publishes observation:view from action:start_view', async () => {
    pipeline.publish('action:start_view', {
      id: 'view-2',
      url: 'http://example.com/checkout',
      startTime: 500,
      startDate: 2000,
      referrer: 'http://example.com/home',
      loadingType: 'route_change',
      name: 'checkout',
    })
    await tick()

    expect(observations.length).toBe(1)
    expect(observations[0].id).toBe('view-2')
    expect(observations[0].name).toBe('checkout')
    expect(observations[0].loadingType).toBe('route_change')
  })

  it('publishes signal:view_changed from action:start_view', async () => {
    pipeline.publish('action:start_view', {
      id: 'view-xyz',
      url: 'http://example.com/',
      startTime: 0,
      startDate: 1000,
      referrer: '',
      loadingType: 'route_change',
    })
    await tick()

    expect(signals.length).toBe(1)
    expect(signals[0].viewId).toBe('view-xyz')
  })
})
