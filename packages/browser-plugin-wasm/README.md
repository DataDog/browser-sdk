# WebAssembly Browser SDK plugin

The Datadog WebAssembly plugin enriches RUM and Logs errors with WebAssembly module metadata so
they can be symbolicated with the matching debug symbols.

## Setup

Register a plugin instance when initializing RUM, Logs, or both:

```js
import { makeWasmPlugin } from '@datadog/browser-plugin-wasm'
import { datadogRum } from '@datadog/browser-rum'
import { datadogLogs } from '@datadog/browser-logs'

datadogRum.init({
  // ...
  plugins: [makeWasmPlugin()],
})

datadogLogs.init({
  // ...
  plugins: [makeWasmPlugin()],
})
```

Use package versions that match the RUM and Logs SDK versions.
