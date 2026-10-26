# RUM Browser Monitoring

Datadog Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

See the [dedicated datadog documentation][1] for more details.

## Usage

To start collecting events, add [`@datadog/browser-rum`][2] to your `package.json` file, then initialize it with:

```javascript
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: '<DATADOG_APPLICATION_ID>',
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  //  service: 'my-web-application',
  //  env: 'production',
  //  version: '1.0.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
  trackUserInteractions: true,
})
```

**Note**: The `trackUserInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained in your pages may be included to identify the elements interacted with.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/real_user_monitoring/browser
[2]: https://www.npmjs.com/package/@datadog/browser-rum


## Worker Profiling (experimental)

CPU profiling of Dedicated Workers. Requires Chromium with the
`DocumentPolicyInDedicatedWorker` and `ProfilerAPIForDedicatedWorker` flags enabled,
and the `Document-Policy: js-profiling` HTTP response header on worker script responses
(inherited from the creating document for `blob:`/`data:` URL workers on Chromium M154+).

### Main thread

```ts
import { datadogRum } from '@datadog/browser-rum'

const detach = datadogRum.attachProfilingWorker(worker, { name: 'my-worker' })

// When done: flush the current profiling session and disconnect.
// The returned Promise resolves once the worker's final profile is collected.
await detach()
worker.terminate() // worker lifecycle is always the caller's responsibility
```

### Inside the worker

```ts
import { attachProfiler } from '@datadog/browser-rum/worker'

attachProfiler()

// ... worker logic ...
```

Worker profiles carry `thread:worker`, `worker.name:<name>`, and
`thread.correlation_id:<uuid>` tags, and are joined with main-thread profiles
collected while that worker was attached (both share the correlation id).

**Note**: the worker sub-entry is an npm-only import — it must be bundled into
the worker script by the customer's bundler. The CDN bundle cannot inject code
into worker scopes.
