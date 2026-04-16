# Browser SDK v7 — Release Notes Draft

## Overview

v7 is a focused major release that improves privacy defaults, removes deprecated options, and modernizes the SDK internals. Most changes require simple configuration updates.

---

## Breaking Changes

### Core

**Session manager rebuilt for better reliability and billing accuracy.** The system that tracks sessions has been rewritten to improve data reliability and reduce billing discrepancies. Some users may notice changes in session counts depending on their setup.

**Sampling decisions are now deterministic.** Previously, the sampling decision was made once at session creation and persisted. It is now computed on demand from the session ID + sample rate, making it consistent regardless of which page initializes the SDK. Users using different sampling rates across pages will now see those rates consistently applied.

**CDN bundles now use ESM dynamic imports** instead of CommonJS, significantly reducing the webpack overhead and overall bundle size. Users using the CDN snippet must add the `crossorigin` attribute:

```html
<script src="https://www.datadoghq-browser-agent.com/..." crossorigin="anonymous"></script>
```

See the updated setup documentation for full snippet examples.

**ES2020 browser baseline.** Dropping support for pre-ES2020 browsers allows the SDK to remove a significant amount of compatibility shims and polyfills, reducing bundle size and simplifying the codebase. Browsers that don't meet this baseline will not run the SDK. Estimated impact: ~0.048% less coverage.

Minimum supported versions: Chrome 80+, Firefox 78+, Safari 14+.

**Session store key renamed from `_dd_s` to `_dd_s_v2`.** The new session manager uses an incompatible storage format, so a new key is used to avoid conflicts. On upgrade, existing sessions are automatically migrated from `_dd_s`. Note: rolling back to v6 after migration will start a new session (the v6 SDK won't read the `_dd_s_v2` key). If you have CSP or cookie policies that allowlist specific cookie names, add `_dd_s_v2`.

**Removed options:**

| Option                        | Replacement                                            |
| ----------------------------- | ------------------------------------------------------ |
| `betaEncodeCookieOptions`     | Cookie encoding is now always enabled.                 |
| `allowFallbackToLocalStorage` | Use `sessionPersistence: ['cookie', 'local-storage']`. |

### RUM

**`propagateTraceBaggage` now defaults to `true`.** Propagating baggage enables smarter tail-based sampling and gives traces access to user and account context. Users using distributed tracing on cross-origin requests must either set `propagateTraceBaggage: false` or add `"baggage"` to their `Access-Control-Allow-Headers` response headers.

**`defaultPrivacyLevel` now defaults to `"mask-user-input"`** (was `"mask"`). This provides better out-of-the-box privacy without being as restrictive as full masking. The new default only masks user input, while other content is collected. Users who want to preserve full masking must explicitly set `defaultPrivacyLevel: "mask"`.

**`enablePrivacyForActionName` now defaults to `true`**. Action names could previously leak sensitive text from the DOM. Click action names now follow the `defaultPrivacyLevel` setting by default. Use the [Datadog build plugin](https://github.com/DataDog/build-plugins) or set `enablePrivacyForActionName: false` to opt out.

**`start/stopDurationVital` API change.** The `DurationVitalReference` object is replaced by a `vitalKey` string option. This aligns the API with similar patterns (`startResource`/`stopResource`, `startAction`/`stopAction`) and with the Mobile SDK, while still allowing multiple concurrent vitals with the same name:

```js
// Before
const ref = datadogRum.startDurationVital('myVital')
datadogRum.stopDurationVital(ref)

// After
datadogRum.startDurationVital('myVital', { vitalKey: 'uniqueKey' })
datadogRum.stopDurationVital('myVital', { vitalKey: 'uniqueKey' })
```

**New `session_renewal` view loading type.** When a session expires and is renewed, the new view is now created with `@view.loading_type:session_renewal` instead of `route_change`. Update any dashboards or monitors that filter on `@view.loading_type` if they should also include session-renewed views.

**Document resource timing is now based on real `PerformanceNavigationTiming`.** The initial document resource event previously used a synthetic timing entry. It now uses the browser's native `PerformanceNavigationTiming` directly, which may result in slightly different `resource.duration` values for the document resource. The `initiatorType` for the document resource changes from `"initial_document"` to `"navigation"`. If you use plugins or domain context handlers that inspect `performanceEntry` for document resources, update them to expect a `PerformanceNavigationTiming` instead of `PerformanceResourceTiming`.

**First Input Delay (FID) removed.** Google replaced FID with INP (Interaction to Next Paint) as a Core Web Vital. FID has been removed from the SDK to reduce bundle size. Use INP instead.

**Plugin API: `strategy` removed.** The `strategy` field has been removed from the plugin API. Users using `rum-react` or other integrations must upgrade them to v7 alongside the core SDK.

**Improved action name computation.** The SDK now always uses the tree walker strategy to compute action names, including in shadow DOM / Web Components. This was needed to support the privacy build plugin and simplifies the codebase. Action names may change slightly. The `betaTrackActionsInShadowDom` option has been removed.

**BFCache navigations are now always tracked.** Back/Forward Cache restores are tracked as distinct views with `@view.loading_type:bf_cache`, with accurate loading time and Core Web Vitals. The `trackBfCacheViews` option has been removed.

**Early requests are now always collected.** Resources and requests that occurred before the SDK initialized are automatically captured. Some of those early resources may be missing properties such as status code. The `trackEarlyRequests` option has been removed.

**Async chunk file names now include a `datadog` prefix** (e.g. `datadog-rum-recorder.js`). If you have CSP or caching rules matching the old names, update them accordingly.

### Logs

**Logs now always uses a session manager.** This ensures Logs events are consistently associated with a session ID. When neither cookies nor localStorage are available, the SDK will not send data and will log a warning. Previously, Logs would still start without storage. Use `sessionPersistence: 'memory'` to explicitly enable memory-backed sessions (in worker environments, this fallback is automatic).

**`forwardErrorsToLogs` and `forwardConsoleLogs` are now independent.** The previous behavior was confusing: enabling `forwardErrorsToLogs` also silently forwarded `console.error` calls. These options are now fully independent, giving you precise control over what gets forwarded. To preserve the previous behavior, add `"error"` to your `forwardConsoleLogs` array:

```js
DD_LOGS.init({
  forwardConsoleLogs: ['error', 'warn'],
  // forwardErrorsToLogs: true  // controls unhandled errors only
})
```

**Network errors for cancelled requests no longer sent.** Requests cancelled by the application (aborted fetch/XHR) no longer generate a network error log. This reduces noise in error tracking.

**Removed options:**

| Option         | Replacement                                                          |
| -------------- | -------------------------------------------------------------------- |
| `usePciIntake` | The standard intake is now PCI compliant. Update your CSP if needed. |

### Session Replay

**New serialization algorithm.** The new DOM mutation serialization algorithm (Change Records) is now the default. It produces more accurate recordings and significantly reduces bandwidth usage. The segment format has changed — if you depend on the raw segment format, you will need to update your integration.
