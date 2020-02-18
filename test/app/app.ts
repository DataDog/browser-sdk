import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

// fallback for server side rendering
const origin = typeof location === 'object' ? location.origin : ''

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
