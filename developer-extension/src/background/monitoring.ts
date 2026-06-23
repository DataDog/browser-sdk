import { openobserveLogs } from '@openobserve/browser-logs'
import { BASE_MONITORING_CONFIG } from '../common/monitoringConfig'

// Initialize Datadog logs for service worker
openobserveLogs.init(BASE_MONITORING_CONFIG)

// Add context to distinguish background logs from panel logs
openobserveLogs.setGlobalContext({
  context: 'background',
})
