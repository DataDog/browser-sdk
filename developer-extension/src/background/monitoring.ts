import { datadogLogs } from '@datadog/browser-logs'
import { BASE_MONITORING_CONFIG } from '../common/monitoringConfig'

// Initialize Datadog logs for service worker
datadogLogs.init({
  ...BASE_MONITORING_CONFIG,
  // Service worker: disable automatic collection (not supported in service workers)
  forwardErrorsToLogs: false,
  forwardConsoleLogs: 'all',
})

// Add context to distinguish background logs from panel logs
datadogLogs.setGlobalContext({
  context: 'background',
})
