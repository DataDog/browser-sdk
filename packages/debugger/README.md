# Live Debugger Browser Monitoring

Datadog Live Debugger enables you to capture function execution snapshots, evaluate conditions, and collect runtime data from your application without modifying source code.

## Usage

To start using the live debugger, add [`@datadog/browser-debugger`](https://www.npmjs.com/package/@datadog/browser-debugger) to your `package.json` file, then initialize it with:

```javascript
import { datadogLiveDebugger } from '@datadog/browser-debugger'

datadogLiveDebugger.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  applicationId: '<DATADOG_APPLICATION_ID>',
  service: 'my-web-application',
  site: '<DATADOG_SITE>',
  env: 'production',
  version: '1.0.0',
})
```

The debugger automatically polls for probe updates from the Delivery API.

You can also add probes programmatically:

```javascript
datadogLiveDebugger.addProbe({
  id: 'probe-1',
  version: 0,
  type: 'LOG_PROBE',
  where: { typeName: 'MyClass', methodName: 'myMethod' },
  template: 'Method executed with duration: {@duration}ms',
  segments: [
    { str: 'Method executed with duration: ' },
    { dsl: '@duration', json: { ref: '@duration' } },
    { str: 'ms' },
  ],
  captureSnapshot: true,
  capture: { maxReferenceDepth: 3 },
  sampling: { snapshotsPerSecond: 5000 },
  evaluateAt: 'EXIT',
})
```

## Integration with RUM

The Live Debugger integrates seamlessly with Datadog RUM to provide enhanced context and correlation:

```javascript
import { datadogRum } from '@datadog/browser-rum'
import { datadogLiveDebugger } from '@datadog/browser-debugger'

// Initialize RUM first
datadogRum.init({
  applicationId: '<DATADOG_APPLICATION_ID>',
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  service: 'my-web-application',
  env: 'production',
})

// Then initialize Live Debugger
datadogLiveDebugger.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  applicationId: '<DATADOG_APPLICATION_ID>',
  service: 'my-web-application',
  site: '<DATADOG_SITE>',
  env: 'production',
})

// Add your probe configurations
// datadogLiveDebugger.addProbe({ ... })
```

When both are initialized, debugger snapshots will automatically include RUM context (session, view, user action).

## Features

- **Dynamic Instrumentation**: Capture function entry/exit without code changes
- **Conditional Breakpoints**: Evaluate conditions before capturing snapshots
- **Template Expressions**: Evaluate custom messages with runtime context
- **Rate Limiting**: Built-in sampling to prevent performance impact
- **Stack Traces**: Automatic stack trace capture for debugging
- **Variable Capture**: Deep capture of arguments, locals, and return values

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/dynamic_instrumentation/
