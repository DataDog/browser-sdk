import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

const origin = global ? '' : window.location.origin

datadogLogs.init({
  clientToken: 'key',
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: `${origin}/monitoring`,
  logsEndpoint: `${origin}/logs`,
  rumEndpoint: `${origin}/rum`,
})

datadogRum.init({
  applicationId: 'rum',
  clientToken: 'key',
  internalMonitoringEndpoint: `${origin}/monitoring`,
  logsEndpoint: `${origin}/logs`,
  rumEndpoint: `${origin}/rum`,
})
