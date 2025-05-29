import type { EvaluationContext } from '@openfeature/web-sdk'

import type { Configuration, UnixTimestamp } from './configuration'

type ConfigurationWire = {
  version: 2
  precomputed?: {
    context?: EvaluationContext
    response: string
    fetchedAt?: UnixTimestamp
  }
}

/**
 * Create configuration from a string created with `configurationToString`.
 */
export function configurationFromString(s: string): Configuration {
  try {
    const wire: ConfigurationWire = JSON.parse(s)

    if (wire.version !== 2) {
      // Unknown version
      return {}
    }

    const configuration: Configuration = {}
    if (wire.precomputed) {
      configuration.precomputed = {
        ...wire.precomputed,
        response: JSON.parse(wire.precomputed.response),
      }
    }

    return configuration
  } catch {
    return {}
  }
}

/**
 * Serialize configuration to string that can be deserialized with
 * `configurationFromString`. The serialized string format is
 * unspecified.
 */
export function configurationToString(configuration: Configuration): string {
  const wire: ConfigurationWire = {
    version: 2,
  }

  if (configuration.precomputed) {
    wire.precomputed = {
      ...configuration.precomputed,
      response: JSON.stringify(configuration.precomputed),
    }
  }

  return JSON.stringify(wire)
}
