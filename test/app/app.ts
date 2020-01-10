import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

datadogLogs.init({
  clientToken: 'key',
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: `${window.location.origin}/monitoring`,
  logsEndpoint: `${window.location.origin}/logs`,
  rumEndpoint: `${window.location.origin}/rum`,
})

datadogRum.init({
  applicationId: 'rum',
  clientToken: 'key',
  internalMonitoringEndpoint: `${window.location.origin}/monitoring`,
  logsEndpoint: `${window.location.origin}/logs`,
  rumEndpoint: `${window.location.origin}/rum`,
})
