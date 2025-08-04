# Browser Log Collection for Service Workers

Send logs to Datadog from service workers and worker contexts with the worker-logs SDK.

This package is a specialized version of the Datadog Browser Logs SDK designed specifically for service worker environments where `window` and `document` objects may not be available.

See the [dedicated datadog documentation][1] for more details.

## Usage

After adding [`@datadog/browser-worker-logs`][2] to your `package.json` file, initialize it with:

```javascript
import { datadogLogs } from '@datadog/browser-worker-logs'

datadogLogs.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
})
```

## Configuration Limitations

The following configuration options are **not available** in worker-logs as they're not applicable to service worker contexts:

- `sessionPersistence`
- `allowFallbackToLocalStorage`
- `storeContextsAcrossPages`
- `trackingConsent`
- `usePartitionedCrossSiteSessionCookie`
- `useSecureSessionCookie`
- `trackSessionAcrossSubdomains`
- `trackAnonymousUser`

## Available Configuration Options

```javascript
datadogLogs.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  service: 'my-service-worker',
  env: 'production',
  version: '1.0.0',
  forwardErrorsToLogs: true,
  forwardConsoleLogs: 'all', // or ['error', 'warn']
  forwardReports: 'all',
  sessionSampleRate: 100,
  telemetrySampleRate: 20,
  beforeSend: (log) => {
    return true
  },
})
```

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/logs/log_collection/javascript
[2]: https://www.npmjs.com/package/@datadog/browser-worker-logs
