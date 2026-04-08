import type { Enricher } from './factory'

interface InternalContext {
  _dd: {
    format_version: 2
    browser_sdk_version?: string
  }
}

interface InternalContextOptions {
  sdkVersion?: string
}

function internalContextEnricher(
  options?: InternalContextOptions
): Enricher<Record<string, unknown>, Record<string, unknown> & InternalContext> {
  return {
    name: 'internal_context',
    transform(data) {
      return {
        ...data,
        _dd: {
          ...(data._dd as Record<string, unknown> | undefined),
          format_version: 2 as const,
          browser_sdk_version: options?.sdkVersion,
        },
      }
    },
  }
}

export { internalContextEnricher }
export type { InternalContext, InternalContextOptions }
