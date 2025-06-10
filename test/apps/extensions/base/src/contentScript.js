import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

datadogRum.init({
  applicationId: '1234',
  clientToken: 'abcd',
  defaultPrivacyLevel: 'allow',
  /* EXTENSION_INIT_PARAMETER */
})

datadogLogs.init({
  clientToken: 'abcd',
  defaultPrivacyLevel: 'allow',
  // Force All sample rates to 100% to avoid flakiness
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
  /* EXTENSION_INIT_PARAMETER */
})
