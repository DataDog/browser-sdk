import { DISCARD } from '@datadog/core-next'
import { rateLimitEnricher } from './rateLimitEnricher'

describe('rateLimitEnricher', () => {
  it('should allow events under the limit', () => {
    const enricher = rateLimitEnricher(5)

    for (let i = 0; i < 5; i++) {
      const result = enricher.transform({ status: 'error' })
      expect(result).not.toBe(DISCARD)
    }
  })

  it('should discard events over the limit', () => {
    const enricher = rateLimitEnricher(2)

    enricher.transform({ status: 'error' })
    enricher.transform({ status: 'error' })
    const result = enricher.transform({ status: 'error' })

    expect(result).toBe(DISCARD)
  })

  it('should have name "rateLimit"', () => {
    const enricher = rateLimitEnricher()

    expect(enricher.name).toBe('rateLimit')
  })
})
