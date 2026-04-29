import { featureFlagEnricher } from './featureFlagEnricher'

describe('featureFlagEnricher', () => {
  it('should have name "featureFlag"', () => {
    const { enricher } = featureFlagEnricher()

    expect(enricher.name).toBe('featureFlag')
  })

  it('should return data unchanged when no flags are set', () => {
    const { enricher } = featureFlagEnricher()
    const data = { type: 'error' }
    const result = enricher.transform(data)

    expect(result).toEqual(data)
  })

  it('should stamp feature_flags when flags exist', () => {
    const { enricher, addEvaluation } = featureFlagEnricher()
    addEvaluation('my-feature', true)

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    expect(result.feature_flags).toEqual({ 'my-feature': true })
  })

  it('should stamp multiple flags', () => {
    const { enricher, addEvaluation } = featureFlagEnricher()
    addEvaluation('flag-a', true)
    addEvaluation('flag-b', 'variant-2')
    addEvaluation('flag-c', 42)

    const result = enricher.transform({ type: 'action' }) as Record<string, unknown>

    expect(result.feature_flags).toEqual({ 'flag-a': true, 'flag-b': 'variant-2', 'flag-c': 42 })
  })

  it('should not stamp feature_flags after clear()', () => {
    const { enricher, addEvaluation, clear } = featureFlagEnricher()
    addEvaluation('flag-x', true)
    clear()

    const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

    expect(result.feature_flags).toBeUndefined()
  })

  it('should preserve other top-level fields', () => {
    const { enricher, addEvaluation } = featureFlagEnricher()
    addEvaluation('flag', 1)

    const result = enricher.transform({ type: 'resource', date: 9999 }) as Record<string, unknown>

    expect(result.type).toBe('resource')
    expect(result.date).toBe(9999)
  })

  it('should overwrite a flag value when the same key is added again', () => {
    const { enricher, addEvaluation } = featureFlagEnricher()
    addEvaluation('toggle', false)
    addEvaluation('toggle', true)

    const result = enricher.transform({ type: 'view' }) as Record<string, unknown>

    expect((result.feature_flags as Record<string, unknown>).toggle).toBe(true)
  })
})
