import { datadogLogs } from 'datadog-logs'
import { datadogRum } from 'datadog-rum'

datadogLogs.init({
  clientToken: 'key',
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: '/monitoring',
  logsEndpoint: '/logs',
})

datadogRum.init({
  applicationId: 'rum',
  clientToken: 'key',
  internalMonitoringEndpoint: '/monitoring',
  rumEndpoint: '/rum',
})
