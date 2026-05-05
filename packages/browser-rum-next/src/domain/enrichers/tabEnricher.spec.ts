import { tabEnricher } from './tabEnricher'

describe('tabEnricher', () => {
  it('adds tab.id to event', () => {
    const enricher = tabEnricher()
    const result = enricher.transform({ type: 'error' })
    expect((result as any).tab).toBeDefined()
    expect((result as any).tab.id).toEqual(jasmine.any(String))
  })

  it('returns the same tab ID across calls', () => {
    const enricher = tabEnricher()
    const r1 = enricher.transform({ type: 'error' })
    const r2 = enricher.transform({ type: 'view' })
    expect((r1 as any).tab.id).toBe((r2 as any).tab.id)
  })

  it('returns the same tab ID across enricher instances', () => {
    const e1 = tabEnricher()
    const e2 = tabEnricher()
    const r1 = e1.transform({ type: 'error' })
    const r2 = e2.transform({ type: 'view' })
    expect((r1 as any).tab.id).toBe((r2 as any).tab.id)
  })

  it('preserves existing event data', () => {
    const enricher = tabEnricher()
    const result = enricher.transform({ type: 'error', error: { message: 'test' } })
    expect((result as any).type).toBe('error')
    expect((result as any).error).toEqual({ message: 'test' })
  })
})
