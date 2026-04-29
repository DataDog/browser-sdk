import { urlContextsEnricher } from './urlContextsEnricher'

describe('urlContextsEnricher', () => {
  it('should have name "urlContexts"', () => {
    const enricher = urlContextsEnricher()

    expect(enricher.name).toBe('urlContexts')
  })

  it('should stamp view.url from window.location.href', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.url).toBe(window.location.href)
  })

  it('should stamp view.referrer from document.referrer', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.referrer).toBe(document.referrer)
  })

  it('should not overwrite existing view.url', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({
      type: 'view',
      view: { url: 'https://custom.example.com/page', referrer: '' },
    }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.url).toBe('https://custom.example.com/page')
  })

  it('should not overwrite existing view.referrer', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({
      type: 'view',
      view: { url: '', referrer: 'https://referrer.example.com/' },
    }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.referrer).toBe('https://referrer.example.com/')
  })

  it('should preserve existing view fields', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({
      type: 'view',
      view: { id: 'view-123', name: 'home' },
    }) as Record<string, unknown>
    const view = result.view as Record<string, unknown>

    expect(view.id).toBe('view-123')
    expect(view.name).toBe('home')
    expect(view.url).toBe(window.location.href)
  })

  it('should preserve other top-level fields', () => {
    const enricher = urlContextsEnricher()
    const result = enricher.transform({ type: 'resource', date: 12345 }) as Record<string, unknown>

    expect(result.type).toBe('resource')
    expect(result.date).toBe(12345)
  })
})
