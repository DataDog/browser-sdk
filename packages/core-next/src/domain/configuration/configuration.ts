interface SdkInitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean
  sessionSampleRate?: number
  env?: string
  service?: string
  version?: string
}

interface SdkConfiguration {
  clientToken: string
  site: string
  enabled: boolean
  sessionSampleRate: number
  env?: string
  service?: string
  version?: string
}

interface ConfigExtension<TKey extends string, TInit, TConfig> {
  key: TKey
  validate(init: TInit | undefined): TConfig | null
}

interface ConfigReader<TConfig extends SdkConfiguration = SdkConfiguration> {
  get(): TConfig
}

function buildConfiguration(
  init: SdkInitConfiguration,
  extensions: ConfigExtension<string, unknown, unknown>[]
): (SdkConfiguration & Record<string, unknown>) | null {
  if (!init.clientToken || !init.site) {
    return null
  }

  const base: SdkConfiguration = {
    clientToken: init.clientToken,
    site: init.site,
    enabled: init.enabled ?? true,
    sessionSampleRate: init.sessionSampleRate ?? 100,
    ...(init.env !== undefined && { env: init.env }),
    ...(init.service !== undefined && { service: init.service }),
    ...(init.version !== undefined && { version: init.version }),
  }

  const result: SdkConfiguration & Record<string, unknown> = { ...base }

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

function createConfigReader<TConfig extends SdkConfiguration>(config: TConfig): ConfigReader<TConfig> {
  return {
    get: () => config,
  }
}

export type { SdkInitConfiguration, SdkConfiguration, ConfigExtension, ConfigReader }
export { buildConfiguration, createConfigReader }
