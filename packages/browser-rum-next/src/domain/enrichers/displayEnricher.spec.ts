import { displayEnricher } from './displayEnricher'

describe('displayEnricher', () => {
  it('should have name "display"', () => {
    const enricher = displayEnricher()

    expect(enricher.name).toBe('display')
  })

  it('should stamp display.viewport with window dimensions', () => {
    const enricher = displayEnricher()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    const display = result.display as Record<string, unknown>
    const viewport = display.viewport as Record<string, unknown>
    expect(typeof viewport.width).toBe('number')
    expect(typeof viewport.height).toBe('number')
  })

  it('should preserve existing fields', () => {
    const enricher = displayEnricher()

    const result = enricher.transform({ type: 'resource', url: 'https://example.com' }) as Record<string, unknown>

    expect(result.type).toBe('resource')
    expect(result.url).toBe('https://example.com')
    expect(result.display).toBeDefined()
  })
})
