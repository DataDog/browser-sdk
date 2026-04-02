interface InitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean
  sessionSampleRate?: number
  telemetrySampleRate?: number
  telemetryConfigurationSampleRate?: number
  telemetryUsageSampleRate?: number
  env?: string
  service?: string
  version?: string
}

interface Configuration {
  clientToken: string
  site: string
  enabled: boolean
  sessionSampleRate: number
  telemetrySampleRate: number
  telemetryConfigurationSampleRate: number
  telemetryUsageSampleRate: number
  env?: string
  service?: string
  version?: string
}

interface ConfigExtension<TKey extends string, TInit, TConfig> {
  key: TKey
  validate(init: TInit | undefined): TConfig | null
}

import { validateConfiguration } from './validation'

function buildConfiguration(
  init: InitConfiguration,
  extensions: ConfigExtension<string, unknown, unknown>[]
): (Configuration & Record<string, unknown>) | null {
  if (!validateConfiguration(init)) {
    return null
  }

  const base: Configuration = {
    clientToken: init.clientToken,
    site: init.site,
    enabled: init.enabled ?? true,
    sessionSampleRate: init.sessionSampleRate ?? 100,
    telemetrySampleRate: init.telemetrySampleRate ?? 20,
    telemetryConfigurationSampleRate: init.telemetryConfigurationSampleRate ?? 5,
    telemetryUsageSampleRate: init.telemetryUsageSampleRate ?? 5,
    ...(init.env !== undefined && { env: init.env }),
    ...(init.service !== undefined && { service: init.service }),
    ...(init.version !== undefined && { version: init.version }),
  }

  const result: Configuration & Record<string, unknown> = { ...base }

  for (const extension of extensions) {
    const initSlice = (init as unknown as Record<string, unknown>)[extension.key]
    if (initSlice === undefined) {
      continue
    }
    const configSlice = extension.validate(initSlice)
    if (configSlice === null) {
      return null
    }
    result[extension.key] = configSlice
  }

  return result
}

export type { InitConfiguration, Configuration, ConfigExtension }
export { buildConfiguration }
