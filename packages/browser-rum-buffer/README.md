# Early RUM error buffer

An optional synchronous script that captures uncaught exceptions and unhandled promise rejections before the RUM SDK loads. It uses the same runtime-error collector as the SDK and preserves the existing `RawError` processing.

## Loading

Build with `yarn workspace @datadog/browser-rum-buffer build`. Place the resulting `bundle/datadog-rum-buffer.js` on your server and load it before application scripts:

```html
<head>
  <script src="/assets/datadog-rum-buffer.js"></script>
  <!-- Application scripts and the normal asynchronous or npm-based RUM setup follow. -->
</head>
```

The script has no initialization call. Initialize RUM normally when it is available. Use the buffer and RUM SDK from the same release; a CDN URL is not available until the package is released and deployed.

The early script creates one buffer, retaining the latest 500 entries. RUM adopts that same buffer and adds its fetch, XHR, and console collectors at SDK evaluation. History is released only after SDK initialization attaches the consumers; there is no intermediate buffer or history transfer. Events continue through the normal consent, sampling, and initialization gates. Nothing is sent by this script itself. If RUM never loads, the bounded buffer remains until page unload.

This version supports a single RUM instance. It does not capture early `console.error`, fetch/XHR activity, or user actions. Logs uses the same source factory with its own buffer starting at Logs evaluation; it does not consume the early RUM history. Errors before the script executes cannot be captured. Repeated script loads reuse the existing collector.

## Internal integration

`browser-rum-core` imports `getOrCreateRumBuffer` from the module entry and passes its `BufferedDataSource` to `browser-core`'s `startBufferingData`. Importing the module entry alone has no collection side effects. The standalone entry starts capture immediately.

The internal global lets separate bundles share a live collector. The SDK directly reuses an existing handle without runtime compatibility checks; use matching buffer and SDK releases. No utilities are moved from `browser-core`, and `browser-core` does not depend on this package.

Diagnostic callbacks are connected during adoption so the early bundle's internal errors and buffered source-context usage telemetry reach the SDK's existing sinks. Same-module capture reuses those sinks directly.

The source emits the existing discriminated `BufferedData` union and declares its collected `types`. Core starts collectors only for types not supplied by the source. This allows future early collectors to reuse the same integration; this release declares only `RUNTIME_ERROR` and still constructs `RawError` once.

Logs calls `createDataBuffer()` to create an independent source. Both SDKs pass a source to `startBufferingData`, which no longer installs a fallback runtime-error collector.

`rumBuffer` owns collector subscriptions through `subscribe(type, createSource)`: it starts each type once, tracks its cleanup, and ignores additions after stop. `startBufferingData` only attaches SDK-only collectors and returns the same source. Their factories remain outside the standalone entry, so moving subscription ownership does not pull network or console collection into the synchronous bundle.
