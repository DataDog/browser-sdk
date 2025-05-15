import type { RumConfiguration } from '@flashcatcloud/browser-rum-core'
import { SPEC_ENDPOINTS } from '@flashcatcloud/browser-core/test'
import { validateAndBuildRumConfiguration } from '../src/domain/configuration'

export function mockRumConfiguration(partialConfig: Partial<RumConfiguration> = {}): RumConfiguration {
  const FAKE_APP_ID = 'appId'
  const baseConfig: RumConfiguration = {
    ...validateAndBuildRumConfiguration({
      clientToken: 'xxx',
      applicationId: FAKE_APP_ID,
      trackResources: true,
      trackLongTasks: true,
      trackAnonymousUser: true,
    })!,
    ...SPEC_ENDPOINTS,
  }
  return { ...baseConfig, ...partialConfig }
}
