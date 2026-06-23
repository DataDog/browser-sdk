import type { Configuration } from '../src/domain/configuration'
import { validateAndBuildConfiguration } from '../src/domain/configuration'

export function mockBaseConfiguration(partialConfig: Partial<Configuration> = {}): Configuration {
  const baseConfig: Configuration = {
    ...validateAndBuildConfiguration({
      clientToken: 'xxx',
    })!,
  }
  return { ...baseConfig, ...partialConfig }
}
