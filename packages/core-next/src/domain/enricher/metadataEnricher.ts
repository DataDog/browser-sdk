import type { Enricher } from './factory'

interface Metadata {
  date: number
  source: string
  service?: string
  version?: string
}

interface MetadataEnricherOptions {
  service?: string
  version?: string
  source?: string
}

/**
 * Adds base metadata fields to every event: `date`, `source`, and optionally `service`.
 */
function metadataEnricher(
  options?: MetadataEnricherOptions
): Enricher<Record<string, unknown>, Record<string, unknown> & Metadata> {
  const source = options?.source ?? 'browser'

  return {
    name: 'metadata',
    transform(data) {
      return {
        ...data,
        date: (data.date as number | undefined) ?? Date.now(),
        source,
        ...(options?.service && { service: options.service }),
        ...(options?.version && { version: options.version }),
      }
    },
  }
}

export { metadataEnricher }
export type { Metadata, MetadataEnricherOptions }
