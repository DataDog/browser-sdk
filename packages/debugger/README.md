# Browser Live Debugger

Datadog Live Debugger enables you to capture function execution snapshots, evaluate conditions, and collect runtime data from your application without modifying source code.

See the [dedicated Datadog documentation][1] for more details.

## Usage

To start collecting data, add [`@datadog/browser-debugger`][2] to your `package.json` file, then initialize it with:

```js
import { datadogDebugger } from '@datadog/browser-debugger'

datadogDebugger.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  service: 'my-web-application',
  //  env: 'production',
  //  version: 'my-deployed-build-version',
})
```

When you also use the Datadog Live Debugger build plugin, `init().version` defaults to the build-time `liveDebugger.version` metadata injected into the bundle. If you pass both values explicitly and they differ, the SDK keeps the `init()` value and logs a warning.

If provided, `version` should be set to the immutable deployed browser build identifier used for source map upload and browser build resolution. If omitted, debugger delivery and snapshots still work, but browser build lookup and source-aware resolution may be unavailable.

## Troubleshooting

Need help? Contact [Datadog Support][3].

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/tracing/live_debugger/
[2]: https://www.npmjs.com/package/@datadog/browser-debugger
[3]: https://docs.datadoghq.com/help/
