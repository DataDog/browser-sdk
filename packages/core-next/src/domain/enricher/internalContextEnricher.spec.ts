import { internalContextEnricher } from './internalContextEnricher'

describe('internalContextEnricher', () => {
  it('should add _dd.format_version to the event', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test' })

    expect(result).toEqual(jasmine.objectContaining({ _dd: jasmine.objectContaining({ format_version: 2 }) }))
  })

  it('should add browser_sdk_version when provided', () => {
    const enricher = internalContextEnricher({ sdkVersion: '1.2.3' })

    const result = enricher.transform({ message: 'test' })

    expect(result).toEqual(
      jasmine.objectContaining({ _dd: jasmine.objectContaining({ browser_sdk_version: '1.2.3' }) })
    )
  })

  it('should not include browser_sdk_version when not provided', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test' })

    expect((result as any)._dd.browser_sdk_version).toBeUndefined()
  })

  it('should preserve existing event fields', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test', status: 'info' })

    expect(result).toEqual(jasmine.objectContaining({ message: 'test', status: 'info' }))
  })

  it('should merge with existing _dd fields', () => {
    const enricher = internalContextEnricher({ sdkVersion: '1.0.0' })

    const result = enricher.transform({ message: 'test', _dd: { drift: 42 } })

    expect((result as any)._dd).toEqual({ drift: 42, format_version: 2, browser_sdk_version: '1.0.0' })
  })

  it('should have name "internal_context"', () => {
    const enricher = internalContextEnricher()

    expect(enricher.name).toBe('internal_context')
  })
})
