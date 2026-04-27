import packageJson from '../../package.json'

// Base monitoring configuration shared by both panel and background
export const BASE_MONITORING_CONFIG = {
  clientToken: 'pub74fd472504982beb427b647893758040',
  site: 'datadoghq.com' as const,
  service: 'browser-sdk-developer-extension',
  env: 'prod' as const,
  version: packageJson.version,
  sessionSampleRate: 100,
  telemetrySampleRate: 100,
  sessionPersistence: 'local-storage' as const,
  forwardErrorsToLogs: true,
  forwardConsoleLogs: 'all' as const,
}

export const RUM_CONFIG = {
  ...BASE_MONITORING_CONFIG,
  applicationId: '235202fa-3da1-4aeb-abc4-d01b10ca1539',
  sessionReplaySampleRate: 100,
  trackUserInteractions: true,
  trackViewsManually: true,
  trackResources: true,
  trackLongTasks: true,
  defaultPrivacyLevel: 'mask' as const,
}
