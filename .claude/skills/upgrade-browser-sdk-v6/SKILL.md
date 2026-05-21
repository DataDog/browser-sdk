---
name: upgrade-browser-sdk-v6
description: Use when upgrading Datadog Browser SDK from v5 to v6, when encountering removed options like useCrossSiteSessionCookie, sendLogsAfterSessionExpiration, or when dropping IE11 support
---

# Upgrade Datadog Browser SDK to v6

Systematic migration guide from v5 to v6. Follow steps 1-6 in order. Each step includes a search pattern to find affected code.

## Step 1: Update SDK version

**CDN setup** — update script `src` URLs:

| v5 pattern                                               | v6 replacement                                           |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `datadoghq-browser-agent.com/us1/v5/datadog-rum.js`      | `datadoghq-browser-agent.com/us1/v6/datadog-rum.js`      |
| `datadoghq-browser-agent.com/us1/v5/datadog-logs.js`     | `datadoghq-browser-agent.com/us1/v6/datadog-logs.js`     |
| `datadoghq-browser-agent.com/us1/v5/datadog-rum-slim.js` | `datadoghq-browser-agent.com/us1/v6/datadog-rum-slim.js` |

Replace `us1` with your site: `eu1`, `us3`, `us5`, `ap1`, `ap2`. For US1-FED, the pattern is flat: `datadog-rum-v6.js` (no site prefix).

Search: `grep -r "datadoghq-browser-agent.com.*v5" --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx"`

**npm setup** — update `package.json` dependencies:

```
"@datadog/browser-rum": "^6.0.0"
"@datadog/browser-logs": "^6.0.0"
"@datadog/browser-rum-slim": "^6.0.0"
```

Then run your package manager (`npm install`, `yarn install`, etc.) and rebuild.

Also upgrade framework integrations to v6 if used: `@datadog/browser-rum-react`.

Search: `grep -r "@datadog/browser-" package.json`

## Step 2: Remove deprecated options

### Removed from Core (affects both RUM and Logs)

| Option                      | Action                                               |
| --------------------------- | ---------------------------------------------------- |
| `useCrossSiteSessionCookie` | Replace with `usePartitionedCrossSiteSessionCookie`. |

### Removed from Logs

| Option                           | Action                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sendLogsAfterSessionExpiration` | Delete. In v6, logs are always sent after session expiration (without a session ID). The option is no longer needed. |

Search: `grep -rn 'useCrossSiteSessionCookie\|sendLogsAfterSessionExpiration' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.html"`

## Step 3: Update changed defaults

v6 changes several default behaviors. Review each and adjust if needed:

### 3a. `trackUserInteractions`, `trackResources`, and `trackLongTasks` default to `true`

In v5, these were `false` by default. In v6, they are enabled out of the box. This does not impact billing.

To preserve v5 behavior, explicitly disable them:

```js
DD_RUM.init({
  trackUserInteractions: false,
  trackResources: false,
  trackLongTasks: false,
})
```

### 3b. `traceContextInjection` defaults to `"sampled"`

In v5, trace context was injected for all requests. In v6, it's only injected for sampled traces. If your `traceSampleRate` is 100% (the default), this has no impact.

To preserve v5 behavior:

```js
DD_RUM.init({
  traceContextInjection: 'all',
})
```

### 3c. `tracestate` header added with `tracecontext` propagator

The `tracecontext` propagator now sends an additional `tracestate` header. Your server must accept it:

```
Access-Control-Allow-Headers: traceparent, tracestate
```

### 3d. `site` parameter is strongly typed

The `site` option has a stricter TypeScript type. If you pass a non-standard value, you get a type error. Use `proxy` for non-standard intake URLs instead.

Search: `grep -rn 'trackUserInteractions\|trackResources\|trackLongTasks\|traceContextInjection\|tracestate' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.html"`

## Step 4: Handle Session Replay lazy loading

Session Replay is now lazy-loaded using dynamic imports. The module loads only for sessions sampled for replay, reducing bundle size for others.

### npm setup

Ensure your bundler supports dynamic imports (code splitting). Most modern bundlers do:

- **Webpack**: [Code splitting docs](https://webpack.js.org/guides/code-splitting/#dynamic-imports)
- **Esbuild**: [Splitting option](https://esbuild.github.io/api/#splitting)
- **Rollup**: [Code splitting docs](https://rollupjs.org/tutorial/#code-splitting)
- **Parcel**: [Code splitting docs](https://parceljs.org/features/code-splitting)

### CDN setup

No code changes needed. The SDK dynamically loads an additional chunk when recording (e.g., `recorder-<hash>-datadog-rum.js`). Update CSP `script-src` rules if needed to allow the chunk.

## Step 5: Review behavioral changes (no code required, but may need attention)

| Change                                       | Impact                                                                                                             | Action if needed                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| IE11 support dropped                         | SDK built with ES2018 target. Polyfills removed.                                                                   | Keep using v5 if IE11 support is required.                              |
| Long Animation Frames replace Long Tasks     | On supported browsers, Long Animation Frames are collected instead of Long Tasks. Event type is still `long_task`. | Review if you inspect long task event details.                          |
| Session cookie expiration extended to 1 year | Supports anonymous user tracking.                                                                                  | Set `trackAnonymousUser: false` to opt out.                             |
| `RegExp` and `Event` objects sanitized       | These are no longer serialized as-is in context/attributes.                                                        | Use string representations if you were passing RegExp or Event objects. |
| Webpack `ChunkLoadError` no longer collected | Reduces noise from SDK chunk loading failures.                                                                     | No action needed.                                                       |

## Step 6: Update infrastructure

- **Browser support**: ES2018 baseline. IE11 is no longer supported.
- **CORS**: Add `tracestate` to `Access-Control-Allow-Headers` if using the `tracecontext` propagator:
  ```
  Access-Control-Allow-Headers: traceparent, tracestate
  ```
- **CSP**: Allow the dynamically loaded Session Replay chunk (e.g., `recorder-*-datadog-rum.js`) in `script-src` rules.
- **Bundler config**: Ensure your bundler supports dynamic imports for Session Replay lazy loading.

## Verification checklist

After upgrading, confirm:

- [ ] SDK loads without console errors
- [ ] No references to removed options (`useCrossSiteSessionCookie`, `sendLogsAfterSessionExpiration`)
- [ ] Session Replay recordings working (if used)
- [ ] Distributed tracing working (no CORS errors from `tracestate` header)
- [ ] Bundle size decreased (IE11 polyfills removed)
- [ ] Long tasks still collected (now as Long Animation Frames on supported browsers)
- [ ] No TypeScript errors from `site` parameter typing
