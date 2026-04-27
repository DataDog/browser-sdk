import { datadogLogs } from '@datadog/browser-logs'
import { BASE_MONITORING_CONFIG } from '../common/monitoringConfig'

// Initialize Datadog logs for service worker
datadogLogs.init(BASE_MONITORING_CONFIG)

// Add context to distinguish background logs from panel logs
datadogLogs.setGlobalContext({
  context: 'background',
})
