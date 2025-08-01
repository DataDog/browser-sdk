import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

// NOTE: RUM and Logs data produced during E2E tests are not sent to the E2E intake, because it's
// not using the E2E init configuration including the `proxy` configuration.
// This could be changed in the future.

datadogRum.init({
  applicationId: '1234',
  clientToken: 'abcd',
  /* EXTENSION_INIT_PARAMETER */
})

datadogLogs.init({
  clientToken: 'abcd',
  /* EXTENSION_INIT_PARAMETER */
})
