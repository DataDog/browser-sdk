import type { RumConfiguration } from '@datadog/browser-rum-core'
import { validateAndBuildRumConfiguration } from '../src/domain/configuration'

export const FAKE_APP_ID = 'appId'

export function mockRumConfiguration(partialConfig: Partial<RumConfiguration> = {}): RumConfiguration {
  const baseConfig: RumConfiguration = {
    ...validateAndBuildRumConfiguration({
      clientToken: 'xxx',
      applicationId: FAKE_APP_ID,
      trackResources: true,
      trackLongTasks: true,
      trackAnonymousUser: true,
    })!,
  }
  return { ...baseConfig, ...partialConfig }
}
