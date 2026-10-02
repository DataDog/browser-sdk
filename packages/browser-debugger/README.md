# Browser Live Debugger

Datadog Live Debugger enables you to capture function execution snapshots, evaluate conditions, and collect runtime data from your application without modifying source code.

See the [dedicated Datadog documentation][1] for more details.

## Prerequisites

### Content Security Policy

Probe conditions, dynamic log-message expressions, and capture expressions use `new Function()` to evaluate JavaScript at runtime. If your page has a Content Security Policy (CSP) that restricts script execution, it must permit `'unsafe-eval'` in `script-src` to use these features.

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

## RUM actions

When the [RUM Browser SDK][4] is loaded on the page, the first hit of each probe starts a RUM custom action named `probe: <function> (<file>)`. The action lasts until the instrumented function returns or throws, and its context includes the probe, the ID of the snapshot sent for that hit, and the outcome (`return` or `throw`, with the error type). Only hits that pass sampling and the probe condition count, and only probes evaluated at function entry are tracked. To disable this, set `trackProbeHitsAsRumActions: false` in `init()`.

## Troubleshooting

Need help? Contact [Datadog Support][3].

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/tracing/live_debugger/
[2]: https://www.npmjs.com/package/@datadog/browser-debugger
[3]: https://docs.datadoghq.com/help/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
