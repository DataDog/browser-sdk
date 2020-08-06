import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

// fallback for server side rendering
const hostname = typeof location === 'object' ? location.hostname : ''
const intakeOrigin = `http://${hostname}:4000`
const search = typeof location === 'object' ? location.search : 'spec-id=0'
const specIdParam = /spec-id=\d+/.exec(search)![0]

datadogLogs.init({
  clientToken: 'key',
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: `${intakeOrigin}/monitoring?${specIdParam}`,
  logsEndpoint: `${intakeOrigin}/logs?${specIdParam}`,
  rumEndpoint: `${intakeOrigin}/rum?${specIdParam}`,
  traceEndpoint: `${intakeOrigin}/trace?${specIdParam}`,
})

datadogRum.init({
  applicationId: 'rum',
  clientToken: 'key',
  enableExperimentalFeatures: [],
  internalMonitoringEndpoint: `${intakeOrigin}/monitoring?${specIdParam}`,
  logsEndpoint: `${intakeOrigin}/logs?${specIdParam}`,
  rumEndpoint: `${intakeOrigin}/rum?${specIdParam}`,
  traceEndpoint: `${intakeOrigin}/trace?${specIdParam}`,
  trackInteractions: true,
})
