interface InitConfiguration {
  clientToken: string
  site: string
  enabled?: boolean
  sessionSampleRate?: number
  env?: string
  service?: string
  version?: string
}

interface Configuration {
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

function buildConfiguration(
  init: InitConfiguration,
  extensions: ConfigExtension<string, unknown, unknown>[]
): (Configuration & Record<string, unknown>) | null {
  if (!init.clientToken || !init.site) {
    return null
  }

  const base: Configuration = {
    clientToken: init.clientToken,
    site: init.site,
    enabled: init.enabled ?? true,
    sessionSampleRate: init.sessionSampleRate ?? 100,
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
