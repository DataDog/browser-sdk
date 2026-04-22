import { pageStateEnricher } from './pageStateEnricher'

describe('pageStateEnricher', () => {
  it('should have name "pageState"', () => {
    const enricher = pageStateEnricher()

    expect(enricher.name).toBe('pageState')
  })

  it('should stamp page_state with document.visibilityState', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    expect(result.page_state === 'visible' || result.page_state === 'hidden').toBe(true)
  })

  it('should preserve existing fields', () => {
    const enricher = pageStateEnricher()

    const result = enricher.transform({ type: 'resource', url: 'https://example.com' }) as Record<string, unknown>

    expect(result.type).toBe('resource')
    expect(result.url).toBe('https://example.com')
    expect(result.page_state).toBeDefined()
  })
})
