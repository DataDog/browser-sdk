import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

datadogRum.init({
  applicationId: '1234',
  clientToken: 'abcd',
  defaultPrivacyLevel: 'allow',
  trackResources: true,
  trackLongTasks: true,
  allowUntrustedEvents: true,
  /* EXTENSION_INIT_PARAMETER */
})

// The above tag is to find and replace on build.

datadogLogs.init({
  clientToken: 'abcd',
  defaultPrivacyLevel: 'allow',
  // Force All sample rates to 100% to avoid flakiness
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
  /* EXTENSION_INIT_PARAMETER */
})
