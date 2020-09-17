import { datadogLogs } from '@datadog/browser-logs'
import { datadogRum } from '@datadog/browser-rum'

// fallback for server side rendering
const hostname = typeof location === 'object' ? location.hostname : ''
const origin = typeof location === 'object' ? location.origin : ''
const search = typeof location === 'object' ? location.search : 'spec-id=0'

const intakeOrigin = `http://${hostname}:4000`
const specIdParam = /spec-id=\d+/.exec(search)![0]

datadogLogs.init({
  clientToken: 'key',
  forwardErrorsToLogs: true,
  internalMonitoringEndpoint: `${intakeOrigin}/v1/input/monitoring?${specIdParam}`,
  logsEndpoint: `${intakeOrigin}/v1/input/logs?${specIdParam}`,
  rumEndpoint: `${intakeOrigin}/v1/input/rum?${specIdParam}`,
})

datadogRum.init({
  allowedTracingOrigins: [origin],
  applicationId: 'rum',
  clientToken: 'key',
  enableExperimentalFeatures: [],
  internalMonitoringEndpoint: `${intakeOrigin}/v1/input/monitoring?${specIdParam}`,
  logsEndpoint: `${intakeOrigin}/v1/input/logs?${specIdParam}`,
  rumEndpoint: `${intakeOrigin}/v1/input/rum?${specIdParam}`,
  service: 'e2e',
  trackInteractions: true,
})
