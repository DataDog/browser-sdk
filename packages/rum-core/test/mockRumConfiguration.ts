import type { RumConfiguration } from '@datadog/browser-rum-core'
import { SPEC_ENDPOINTS } from '@datadog/browser-core/test'
import { validateAndBuildRumConfiguration } from '../src/domain/configuration'

export function mockRumConfiguration(partialConfig: Partial<RumConfiguration> = {}): RumConfiguration {
  const FAKE_APP_ID = 'appId'
  const baseConfig: RumConfiguration = {
    ...validateAndBuildRumConfiguration({
      clientToken: 'xxx',
      applicationId: FAKE_APP_ID,
      trackResources: true,
      trackLongTasks: true,
    })!,
    ...SPEC_ENDPOINTS,
  }

  return { ...baseConfig, ...partialConfig }
}
