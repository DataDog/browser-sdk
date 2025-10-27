import { DefaultPrivacyLevel } from '@datadog/browser-rum'

export const APPLICATION_ID = '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8'
export const CLIENT_TOKEN = 'pubf2099de38f9c85797d20d64c7d632a69'

export const DEFAULT_RUM_CONFIGURATION = {
  applicationId: APPLICATION_ID,
  clientToken: CLIENT_TOKEN,
  defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
  trackResources: true,
  trackLongTasks: true,
  enableExperimentalFeatures: [],
  allowUntrustedEvents: true,
  // Force All sample rates to 100% to avoid flakiness
  sessionReplaySampleRate: 100,
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
}

export const DEFAULT_LOGS_CONFIGURATION = {
  clientToken: CLIENT_TOKEN,
  // Force All sample rates to 100% to avoid flakiness
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
}
