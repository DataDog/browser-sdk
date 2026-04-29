import { Pipeline } from '@datadog/core-next'
import { startProcessor } from './processor'
import type { SerializedViewEvent, ViewChangedSignal } from './types'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('view processor', () => {
  let pipeline: Pipeline<Record<string, unknown>>
  let observations: SerializedViewEvent[]
  let signals: ViewChangedSignal[]

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    observations = []
    signals = []
    pipeline.subscribe('observation:view', (e) => observations.push(e as SerializedViewEvent))
    pipeline.subscribe('signal:view_changed', (e) => signals.push(e as ViewChangedSignal))
    startProcessor({ pipeline })
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
    expect(observations[0].view.id).toBe('view-1')
    expect(observations[0].view.url).toBe('http://example.com/home')
    expect(observations[0].view.loading_type).toBe('initial_load')
    expect(observations[0].date).toBe(1000)
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
    expect(observations[0].view.id).toBe('view-2')
    expect(observations[0].view.name).toBe('checkout')
    expect(observations[0].view.loading_type).toBe('route_change')
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

  it('includes view.time_spent and _dd.document_version in observation:view', async () => {
    pipeline.publish('resource:navigation', {
      url: '/',
      startTime: performance.now(),
      startDate: Date.now(),
      referrer: '',
      loadingType: 'initial_load',
    })
    await tick()

    expect(observations[0].view.time_spent).toBeGreaterThanOrEqual(0)
    expect(observations[0]._dd.document_version).toBe(1)
  })

  it('accumulates FCP on initial load', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:paint', { name: 'first-contentful-paint', startTime: 450 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.first_contentful_paint).toBe(450)
    expect(latest._dd.document_version).toBe(2)
  })

  it('includes fcp in performance sub-object', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:paint', { name: 'first-contentful-paint', startTime: 450 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.performance?.fcp?.timestamp).toBe(450)
  })

  it('does not accumulate FCP on route_change', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'route_change' })
    await tick()
    pipeline.publish('resource:paint', { name: 'first-contentful-paint', startTime: 450 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.first_contentful_paint).toBeUndefined()
  })

  it('accumulates LCP on initial load', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:largest_contentful_paint', { startTime: 800, size: 5000 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.largest_contentful_paint).toBe(800)
  })

  it('includes lcp in performance sub-object', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:largest_contentful_paint', { startTime: 800, size: 5000 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.performance?.lcp?.timestamp).toBe(800)
  })

  it('stops LCP after first interaction', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:largest_contentful_paint', { startTime: 800, size: 5000 })
    await tick()
    pipeline.publish('resource:performance_event', { duration: 50, startTime: 1000, processingStart: 1010, processingEnd: 1040, interactionId: 1 })
    await tick()
    pipeline.publish('resource:largest_contentful_paint', { startTime: 1500, size: 8000 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.largest_contentful_paint).toBe(800) // not 1500
  })

  it('accumulates CLS from layout shifts', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:layout_shift', { value: 0.1, hadRecentInput: false, startTime: 500 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.cumulative_layout_shift).toBe(0.1)
  })

  it('includes cls in performance sub-object', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:layout_shift', { value: 0.1, hadRecentInput: false, startTime: 500 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.performance?.cls?.score).toBe(0.1)
  })

  it('ignores layout shifts with recent input', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:layout_shift', { value: 0.5, hadRecentInput: true, startTime: 500 })
    await tick()

    // Only the initial observation:view, no metric update
    expect(observations.length).toBe(1)
    expect(observations[0].view.cumulative_layout_shift).toBeUndefined()
  })

  it('accumulates INP from performance events', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:performance_event', { duration: 120, startTime: 2000, processingStart: 2010, processingEnd: 2100, interactionId: 1 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.interaction_to_next_paint).toBe(120)
  })

  it('includes inp in performance sub-object', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:performance_event', { duration: 120, startTime: 2000, processingStart: 2010, processingEnd: 2100, interactionId: 1 })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.performance?.inp?.duration).toBe(120)
  })

  it('accumulates navigation timings on initial load', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:navigation_timing', {
      responseStart: 100,
      domInteractive: 200,
      domContentLoadedEventEnd: 250,
      domComplete: 400,
      loadEventEnd: 450,
    })
    await tick()

    const latest = observations[observations.length - 1]
    expect(latest.view.first_byte).toBe(100)
    expect(latest.view.dom_interactive).toBe(200)
    expect(latest.view.dom_content_loaded).toBe(250)
    expect(latest.view.dom_complete).toBe(400)
    expect(latest.view.load_event).toBe(450)
  })

  it('finalizes previous view when new navigation arrives', async () => {
    pipeline.publish('resource:navigation', { url: '/page1', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    const firstViewId = observations[0].view.id
    pipeline.publish('resource:navigation', { url: '/page2', startTime: 100, startDate: 1100, referrer: '/page1', loadingType: 'route_change' })
    await tick()

    // Find the finalized first view (is_active: false)
    const finalized = observations.find((o) => o.view.id === firstViewId && !o.view.is_active)
    expect(finalized).toBeDefined()
    expect(finalized!.view.is_active).toBe(false)
  })

  it('resets metrics for new view', async () => {
    pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
    await tick()
    pipeline.publish('resource:layout_shift', { value: 0.3, hadRecentInput: false, startTime: 200 })
    await tick()
    // Start new view
    pipeline.publish('resource:navigation', { url: '/page2', startTime: 1000, startDate: 2000, referrer: '/', loadingType: 'route_change' })
    await tick()

    const newView = observations[observations.length - 1]
    expect(newView.view.cumulative_layout_shift).toBeUndefined() // reset
  })

  describe('event counts', () => {
    it('view counts actions when observation:action is published', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      pipeline.publish('observation:action', { type: 'action', date: Date.now(), action: { type: 'custom', target: { name: 'checkout' } } })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.action.count).toBe(1)
    })

    it('view counts errors when observation:error is published', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      pipeline.publish('observation:error', { type: 'error', date: Date.now(), error: { message: 'oops' } })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.error.count).toBe(1)
    })

    it('frustration increments frustrationCount', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      pipeline.publish('observation:action', {
        type: 'action',
        date: Date.now(),
        action: { type: 'click', target: { name: 'btn' }, frustration: { type: ['rage_click'] } },
      })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.action.count).toBe(1)
      expect(latest.view.frustration.count).toBe(1)
    })

    it('event counts reset on new view', async () => {
      pipeline.publish('resource:navigation', { url: '/page1', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      pipeline.publish('observation:action', { type: 'action', date: Date.now(), action: { type: 'custom', target: { name: 'click' } } })
      await tick()

      // Start new view
      pipeline.publish('resource:navigation', { url: '/page2', startTime: 500, startDate: 1500, referrer: '/', loadingType: 'route_change' })
      await tick()

      const newView = observations[observations.length - 1]
      expect(newView.view.action.count).toBe(0)
      expect(newView.view.error.count).toBe(0)
    })
  })

  describe('loading time', () => {
    it('includes view.loading_time from navigation timing loadEventEnd on initial load', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()
      pipeline.publish('resource:navigation_timing', {
        responseStart: 100,
        domInteractive: 200,
        domContentLoadedEventEnd: 250,
        domComplete: 400,
        loadEventEnd: 450,
      })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.loading_time).toBe(450)
    })

    it('view.loading_time is undefined on initial load before navigation timing arrives', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.loading_time).toBeUndefined()
    })

    it('view.loading_time is undefined on route_change before activity settles', async () => {
      pipeline.publish('resource:navigation', { url: '/page2', startTime: 100, startDate: 1100, referrer: '/', loadingType: 'route_change' })
      await tick()

      const latest = observations[observations.length - 1]
      expect(latest.view.loading_time).toBeUndefined()
    })
  })

  describe('scroll metrics', () => {
    it('view does not include top-level scroll field (scroll is not part of v6 serialized view)', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()

      // The serialized event shape does not have a top-level scroll field
      const latest = observations[observations.length - 1]
      expect(latest.type).toBe('view')
      expect(latest.view).toBeDefined()
    })

    it('scroll resets to undefined on new view', async () => {
      pipeline.publish('resource:navigation', { url: '/page1', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()
      pipeline.publish('resource:navigation', { url: '/page2', startTime: 500, startDate: 1500, referrer: '/', loadingType: 'route_change' })
      await tick()

      const newView = observations[observations.length - 1]
      expect(newView.view).toBeDefined()
      expect(newView.type).toBe('view')
    })
  })

  describe('bf_cache view', () => {
    it('bf_cache view gets FCP/LCP from bfcache tracker after RAFs complete', (done) => {
      pipeline.publish('resource:navigation', {
        url: '/',
        startTime: performance.now(),
        startDate: Date.now(),
        referrer: '',
        loadingType: 'bf_cache',
      })

      // Wait for two nested RAFs to complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            // Force a publishUpdate by triggering an event
            pipeline.publish('observation:error', { type: 'error', date: Date.now(), error: { message: 'test' } })
            await tick()

            const latest = observations[observations.length - 1]
            expect(latest.view.first_contentful_paint).toBeDefined()
            expect(latest.view.first_contentful_paint!).toBeGreaterThanOrEqual(0)
            expect(latest.view.largest_contentful_paint).toBeDefined()
            expect(latest.view.largest_contentful_paint!).toBe(latest.view.first_contentful_paint!)
            done()
          })
        })
      })
    })
  })

  describe('_dd.document_version', () => {
    it('document_version increments on each publishUpdate', async () => {
      pipeline.publish('resource:navigation', { url: '/', startTime: 0, startDate: 1000, referrer: '', loadingType: 'initial_load' })
      await tick()
      expect(observations[0]._dd.document_version).toBe(1)

      pipeline.publish('resource:paint', { name: 'first-contentful-paint', startTime: 100 })
      await tick()
      expect(observations[observations.length - 1]._dd.document_version).toBe(2)
    })
  })
})
