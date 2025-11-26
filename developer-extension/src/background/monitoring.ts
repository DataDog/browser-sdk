import { datadogLogs } from '@datadog/browser-logs'
import packageJson from '../../package.json'

// Initialize Datadog logs for service worker
datadogLogs.init({
  clientToken: 'pub74fd472504982beb427b647893758040',
  site: 'datadoghq.com' as const,
  service: 'browser-sdk-developer-extension',
  env: 'prod' as const,
  version: packageJson.version,
  sessionSampleRate: 100,
  telemetrySampleRate: 100,
  sessionPersistence: 'local-storage' as const,
  // Service worker: disable automatic collection (not supported in service workers)
  forwardErrorsToLogs: false,
  forwardConsoleLogs: 'all',
})

// Add context to distinguish background logs from panel logs
datadogLogs.setGlobalContext({
  context: 'background',
})
