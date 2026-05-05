import { SKIP } from '@datadog/core-next'
import { viewContextEnricher } from './viewContextEnricher'
import type { ViewContext } from './viewContextEnricher'

describe('viewContextEnricher', () => {
  it('should have name "viewContext"', () => {
    const enricher = viewContextEnricher({})
    expect(enricher.name).toBe('viewContext')
  })

  it('should return SKIP when no view is active', () => {
    const enricher = viewContextEnricher({})
    const result = enricher.transform({ type: 'error' })
    expect(result).toBe(SKIP)
  })

  it('should stamp view.id from context', () => {
    const ctx: ViewContext = { id: 'view-abc' }
    const enricher = viewContextEnricher(ctx)
    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    expect((result.view as any).id).toBe('view-abc')
  })

  it('should stamp view.name from context', () => {
    const ctx: ViewContext = { id: 'view-abc', name: 'checkout' }
    const enricher = viewContextEnricher(ctx)
    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    expect((result.view as any).id).toBe('view-abc')
    expect((result.view as any).name).toBe('checkout')
  })

  it('should merge with existing view fields', () => {
    const ctx: ViewContext = { id: 'view-xyz', name: 'home' }
    const enricher = viewContextEnricher(ctx)
    const result = enricher.transform({ type: 'resource', view: { url: '/page' } }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>
    expect(view.id).toBe('view-xyz')
    expect(view.name).toBe('home')
    expect(view.url).toBe('/page')
  })

  it('should reflect context updates without re-creating enricher', () => {
    const ctx: ViewContext = { id: 'view-1' }
    const enricher = viewContextEnricher(ctx)

    ctx.id = 'view-2'
    ctx.name = 'new-page'

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    expect((result.view as any).id).toBe('view-2')
    expect((result.view as any).name).toBe('new-page')
  })
})
