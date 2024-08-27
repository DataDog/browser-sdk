import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  clientToken: 'pub6306e4c6ea97090902a7ccaa3641c52b',
  applicationId: '40d8ca4b-2ac0-481f-b16e-f110699ecff6',
  sessionReplaySampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
  telemetrySampleRate: 100,
  telemetryConfigurationSampleRate: 100,
  telemetryUsageSampleRate: 100,
  enableExperimentalFeatures: ['custom_vitals'],
  service: 'service',
  site: 'datad0g.com',
})
