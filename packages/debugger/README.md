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
  //  version: '1.0.0',
})
```

If [Datadog RUM][3] is also initialized on the page, debugger snapshots automatically include RUM context (session, view, user action) without any additional configuration.

## Troubleshooting

Need help? Contact [Datadog Support][4].

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/tracing/live_debugger/
[2]: https://www.npmjs.com/package/@datadog/browser-debugger
[3]: https://docs.datadoghq.com/real_user_monitoring/browser
[4]: https://docs.datadoghq.com/help/
