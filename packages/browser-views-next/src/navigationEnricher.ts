import type { Enricher } from '@datadog/core-next'

function navigationEnricher(): Enricher<Record<string, unknown>, Record<string, unknown>, never> {
  return {
    name: 'navigationEnricher',
    transform(data) {
      return { ...data, id: crypto.randomUUID() }
    },
  }
}

export { navigationEnricher }
