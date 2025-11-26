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
}
