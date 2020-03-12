import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

// fallback for server side rendering
const hostname = typeof location === 'object' ? location.hostname : ''
const intakeOrigin = `http://${hostname}:4000`

datadogLogs.init({
  clientToken: 'key',
  enableExperimentalFeatures: true,
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: `${intakeOrigin}/monitoring`,
  logsEndpoint: `${intakeOrigin}/logs`,
  rumEndpoint: `${intakeOrigin}/rum`,
})

datadogRum.init({
  applicationId: 'rum',
  clientToken: 'key',
  enableExperimentalFeatures: true,
  internalMonitoringEndpoint: `${intakeOrigin}/monitoring`,
  logsEndpoint: `${intakeOrigin}/logs`,
  rumEndpoint: `${intakeOrigin}/rum`,
})
