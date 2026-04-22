import { Pipeline } from '@datadog/core-next'
import { SKIP } from '@datadog/core-next'
import { viewContextEnricher } from './viewContextEnricher'

async function tick() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('viewContextEnricher', () => {
  let pipeline: Pipeline<Record<string, unknown>>

  beforeEach(() => {
    pipeline = new Pipeline<Record<string, unknown>>()
    pipeline.seal()
  })

  it('should have name "viewContext"', () => {
    const enricher = viewContextEnricher(pipeline)

    expect(enricher.name).toBe('viewContext')
  })

  it('should return SKIP when no view is active', () => {
    const enricher = viewContextEnricher(pipeline)

    const result = enricher.transform({ type: 'error' })

    expect(result).toBe(SKIP)
  })

  it('should stamp view.id after signal:view_changed', async () => {
    const enricher = viewContextEnricher(pipeline)
    pipeline.publish('signal:view_changed', { viewId: 'view-abc' })
    await tick()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    expect(result).toEqual({ type: 'error', view: { id: 'view-abc' } })
  })

  it('should merge with existing view fields', async () => {
    const enricher = viewContextEnricher(pipeline)
    pipeline.publish('signal:view_changed', { viewId: 'view-xyz' })
    await tick()

    const result = enricher.transform({ type: 'resource', view: { name: 'home' } }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.name).toBe('home')
    expect(view.id).toBe('view-xyz')
  })

  it('should update view.id when signal fires again', async () => {
    const enricher = viewContextEnricher(pipeline)
    pipeline.publish('signal:view_changed', { viewId: 'view-1' })
    await tick()
    pipeline.publish('signal:view_changed', { viewId: 'view-2' })
    await tick()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    expect(result).toEqual({ type: 'error', view: { id: 'view-2' } })
  })
})
