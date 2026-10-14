# Browser Live Debugger

Datadog Live Debugger enables you to capture function execution snapshots, evaluate conditions, and collect runtime data from your application without modifying source code.

See the [dedicated Datadog documentation][1] for more details.

## Prerequisites

Browser Live Debugger is available in limited preview. Contact Datadog to enable it for your organization and agree on the application and expected traffic for the preview.

### Application instrumentation

Instrument your browser application's functions with the [Live Debugger build plugin][5], then initialize the SDK as shown below. The RUM Browser SDK is optional.

During the limited preview, probes can only be added to named functions. Adding probes to anonymous functions is not supported. Named functions include arrow functions assigned to a variable, such as `const handleClick = () => {}`. The build plugin's `liveDebugger.namedOnly: true` option skips anonymous functions during instrumentation.

### Source maps

Upload source maps for the deployed frontend build with matching debug IDs and Git repository/commit metadata. See the [build plugin's source-map setup][6].

Source maps must be available in the same Datadog site and organization that receives the Browser Live Debugger data. You can use your existing upload setup or configure it during onboarding. Set the SDK's `site` to the upload destination and use a `clientToken` from the same organization as the source-map upload API key. The debugger uses its own configuration; it does not inherit the RUM SDK's `site`.

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

The SDK's `init().version` defaults to the build plugin's `metadata.version` value injected into the bundle. If you pass both values explicitly and they differ, the SDK keeps the `init()` value and logs a warning.

If you set `version` for version-specific probe targeting, use an immutable deployed build identifier. Build and source-code resolution through debug IDs does not require `version`.

## RUM actions

When the [RUM Browser SDK][4] is loaded on the page, the first hit of each probe creates a RUM custom action named `probe: <function> (<file>)`. For probes evaluated at function entry, the action lasts until the instrumented function returns or throws. For probes evaluated at function exit, the action is a point in time at the function exit. The action's context includes the probe, the ID of the snapshot sent for that hit, and the outcome (`return` or `throw`, with the error type). Only hits that pass sampling and the probe condition count. To disable this, set `trackProbeHitsAsRumActions: false` in `init()`.

## Troubleshooting

Need help? Contact [Datadog Support][3].

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/tracing/live_debugger/
[2]: https://www.npmjs.com/package/@datadog/browser-debugger
[3]: https://docs.datadoghq.com/help/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
[5]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger
[6]: https://github.com/DataDog/build-plugins/tree/master/packages/plugins/live-debugger#source-maps-for-the-preview
