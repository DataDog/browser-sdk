# Browser Live Debugger

Datadog Live Debugger enables you to capture function execution snapshots, evaluate conditions, and collect runtime data from your application without modifying source code.

See the [dedicated Datadog documentation][1] for more details.

## Prerequisites

### Application instrumentation

Instrument your browser application's functions with the [Live Debugger build plugin][5], then initialize the SDK as shown below. The RUM Browser SDK is optional.

### Source maps

Upload source maps for the deployed frontend build with matching debug IDs and Git repository/commit metadata. See the [build plugin's source-map setup][6].

Source maps must be available in the Datadog site and organization that receive the Browser Live Debugger data. You can use your existing source-map upload setup, or configure a new one during onboarding. The Browser Live Debugger uses its own configuration and does not inherit the RUM SDK's `site`. Set the debugger's `site` to the site you upload source maps to, and use a `clientToken` issued by the same organization as your source-map upload API key.

### Content Security Policy

Probe conditions, dynamic log-message expressions, and capture expressions use `new Function()` to evaluate JavaScript at runtime. If your page has a Content Security Policy (CSP) that restricts script execution, it must permit `'unsafe-eval'` in `script-src` to use these features.

## Limitations during Preview

Browser Live Debugger is in Preview, with the following limitations:

- Probes can be added only to named functions, and all instrumented code on a page must come from a single build. See the [build plugin's Preview limitations][7] for details and additional build requirements.
- This SDK and the Live Debugger build plugin may get breaking changes during the Preview. You may need to upgrade, rebuild, and redeploy to keep debugging working, but your application itself should keep working normally.

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

The SDK's `init().version` defaults to the build plugin's `metadata.version` value injected into the bundle. If you pass both values explicitly and they differ, the SDK keeps the `init()` value and logs a warning.

If you set `version` for version-specific probe targeting, use an immutable deployed build identifier.

## RUM actions

When the [RUM Browser SDK][4] is loaded on the page, the first hit of each probe creates a RUM custom action named `probe: <function> (<file>)`. For probes evaluated at function entry, the action lasts until the instrumented function returns or throws. For probes evaluated at function exit, the action is a point in time at the function exit. The action's context includes the probe, the ID of the snapshot sent for that hit, and the outcome (`return` or `throw`, with the error type). Only hits that pass sampling and the probe condition count. To disable this, set `trackProbeHitsAsRumActions: false` in `init()`.

## Exception Replay

Exception Replay captures the arguments and `this` of the instrumented functions an error passes through, and shows them on the error's stack frames in Error Tracking, without adding probes. It requires the [RUM Browser SDK][4]:

1. Build your application with the Live Debugger build plugin's [`exceptionReplay`][8] option.
2. Register the Exception Replay plugin when initializing the RUM Browser SDK:

   ```js
   import { datadogRum } from '@datadog/browser-rum'
   import { datadogDebugger } from '@datadog/browser-debugger'

   datadogRum.init({
     // ...
     plugins: [datadogDebugger.exceptionReplayPlugin()],
   })
   ```

3. Initialize the Live Debugger SDK as shown in [Usage](#usage).

The SDK captures the three innermost instrumented frames of an exception as it's thrown, and only sends them as snapshots when RUM reports the error. An error with the same type and innermost instrumented function is reported with snapshots at most once an hour. Values of variables and properties with sensitive names, such as `password` or `token`, are redacted. Local variables aren't captured.

Exception Replay snapshots count toward the `maxSnapshotsPerSecondGlobally` limit.

## Troubleshooting

Need help? Contact [Datadog Support][3].

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/tracing/live_debugger/
[2]: https://www.npmjs.com/package/@datadog/browser-debugger
[3]: https://docs.datadoghq.com/help/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
[5]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger
[6]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger#source-maps
[7]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger#limitations-during-preview
[8]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger#livedebuggerexceptionreplay
