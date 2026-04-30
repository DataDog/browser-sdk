import { pageStateEnricher } from './pageStateEnricher'

describe('pageStateEnricher', () => {
  it('should have name "pageState"', () => {
    const enricher = pageStateEnricher()

    expect(enricher.name).toBe('pageState')
  })

  it('should stamp _dd.page_states as an array', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    const dd = result._dd as Record<string, unknown>

    expect(Array.isArray(dd.page_states)).toBe(true)
  })

  it('should include initial state with start: 0', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    const states = (result._dd as any).page_states as Array<{ state: string; start: number }>

    expect(states.length).toBeGreaterThanOrEqual(1)
    expect(states[0].start).toBe(0)
    expect(states[0].state === 'active' || states[0].state === 'passive').toBe(true)
  })

  it('should preserve existing _dd fields', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'error', _dd: { format_version: 2 } }) as Record<string, unknown>
    const dd = result._dd as Record<string, unknown>

    expect(dd.format_version).toBe(2)
    expect(dd.page_states).toBeDefined()
  })

  it('should preserve existing fields', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'resource', url: 'https://example.com' }) as Record<string, unknown>

    expect(result.type).toBe('resource')
    expect(result.url).toBe('https://example.com')
  })
})
