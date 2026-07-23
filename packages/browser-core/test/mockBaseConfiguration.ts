import { validateAndBuildConfiguration } from '@datadog/js-core/configuration'
import type { Configuration } from '../src/domain/configuration'
import { BROWSER_CORE_SCHEMA } from '../src/domain/configuration'
import { mockDisplay } from './mockDisplay'

export function mockBaseConfiguration(partialConfig: Partial<Configuration> = {}): Configuration {
  const baseConfig = validateAndBuildConfiguration(
    { clientToken: 'xxx' },
    BROWSER_CORE_SCHEMA,
    mockDisplay()
  ) as Configuration
  return { ...baseConfig, ...partialConfig }
}
