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

    const result = enricher.transform({ message: 'test', _dd: { custom: 'value' } })

    expect((result as any)._dd).toEqual(
      jasmine.objectContaining({ custom: 'value', format_version: 2, browser_sdk_version: '1.0.0' })
    )
  })

  it('should have name "internal_context"', () => {
    const enricher = internalContextEnricher()

    expect(enricher.name).toBe('internal_context')
  })

  it('should add application.id when provided', () => {
    const enricher = internalContextEnricher({ applicationId: 'app-123' })

    const result = enricher.transform({ message: 'test' })

    expect((result as any).application).toEqual({ id: 'app-123' })
  })

  it('should not include application when applicationId is not provided', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test' })

    expect((result as any).application).toBeUndefined()
  })

  it('should add _dd.drift as a number', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test' })

    expect(typeof (result as any)._dd.drift).toBe('number')
  })

  it('should add _dd.configuration with sample rates when provided', () => {
    const enricher = internalContextEnricher({
      sessionSampleRate: 50,
      sessionReplaySampleRate: 25.5,
      traceSampleRate: 100,
    })

    const result = enricher.transform({ message: 'test' })
    const config = (result as any)._dd.configuration

    expect(config.session_sample_rate).toBe(50)
    expect(config.session_replay_sample_rate).toBe(25.5)
    expect(config.trace_sample_rate).toBe(100)
  })

  it('should not include _dd.configuration when no sample rates provided', () => {
    const enricher = internalContextEnricher()

    const result = enricher.transform({ message: 'test' })

    expect((result as any)._dd.configuration).toBeUndefined()
  })

  it('should round sample rates to 3 decimal places', () => {
    const enricher = internalContextEnricher({ sessionSampleRate: 33.33333 })

    const result = enricher.transform({ message: 'test' })

    expect((result as any)._dd.configuration.session_sample_rate).toBe(33.333)
  })
})
