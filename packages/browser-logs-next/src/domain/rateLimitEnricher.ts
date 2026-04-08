import { DISCARD } from '@datadog/core-next'
import type { Enricher } from '@datadog/core-next'
import { createRateLimiter } from './rateLimiter'

function rateLimitEnricher(limit?: number): Enricher<Record<string, unknown>, Record<string, unknown>> {
  const rateLimiter = createRateLimiter(limit)

  return {
    name: 'rateLimit',
    transform(data) {
      const status = (data.status as string) ?? 'unknown'
      if (rateLimiter.isLimitReached(status)) {
        return DISCARD
      }
      return data
    },
  }
}

export { rateLimitEnricher }
