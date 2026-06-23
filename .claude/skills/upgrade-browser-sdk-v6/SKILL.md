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

Replace `us1` with your site: `eu1`, `us3`, `us5`, `ap1`, `ap2`. For US1-FED, the pattern is flat with no site prefix: `datadog-rum-v6.js`, `datadog-logs-v6.js`, `datadog-rum-slim-v6.js`.

Search: `grep -r "datadoghq-browser-agent.com.*v5" --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"`

**npm setup** — update `package.json` dependencies:

```
"@datadog/browser-rum": "^6.0.0"
"@datadog/browser-logs": "^6.0.0"
"@datadog/browser-rum-slim": "^6.0.0"
```

Then run your package manager (`npm install`, `yarn install`, etc.) and rebuild.

Also upgrade framework integrations to v6 if used: `@datadog/browser-rum-react`.

Search: `grep -r "@datadog/browser-" --include="package.json" .`

## Step 2: Remove deprecated options

### Removed from Core (affects both RUM and Logs)

| Option                      | Action                                               |
| --------------------------- | ---------------------------------------------------- |
| `useCrossSiteSessionCookie` | Replace with `usePartitionedCrossSiteSessionCookie`. |

### Removed from Logs

| Option                           | Action                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sendLogsAfterSessionExpiration` | Delete. In v6, logs are always sent after session expiration (without a session ID). The option is no longer needed. |

Search: `grep -rn 'useCrossSiteSessionCookie\|sendLogsAfterSessionExpiration' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 3: Update changed defaults

v6 changes several default behaviors. Review each and adjust if needed:

### 3a. `trackUserInteractions`, `trackResources`, and `trackLongTasks` default to `true`

In v5, these were `false` by default. In v6, they are enabled out of the box. This does not impact billing.

To preserve v5 behavior, explicitly disable **only the options that were not already enabled in v5**. If an option was already `true` in v5, leave it unchanged:

```js
DD_RUM.init({
  trackUserInteractions: false, // only if not already true in v5
  trackResources: false, // only if not already true in v5
  trackLongTasks: false, // only if not already true in v5
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

The `tracecontext` propagator now sends an additional `tracestate` header. Your server must accept it. Add it to your existing `Access-Control-Allow-Headers` — do not replace the full list:

```
# Add tracestate alongside your existing headers
Access-Control-Allow-Headers: <existing-headers>, traceparent, tracestate
```

### 3d. `site` parameter is strongly typed

The `site` option has a stricter TypeScript type. If you pass a non-standard value, you get a type error. Use `proxy` for non-standard intake URLs instead.

Search: `grep -rn 'trackUserInteractions\|trackResources\|trackLongTasks\|traceContextInjection\|tracestate\|allowedTracingUrls\|propagatorTypes' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

Also search for all RUM init calls to catch projects that omit these options and relied on the v5 `false` defaults: `grep -rn 'DD_RUM\.init\|datadogRum\.init' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`. For each init call, check whether `trackUserInteractions`, `trackResources`, and `trackLongTasks` are explicitly set — if omitted, they now default to `true` in v6.

## Step 4: Handle Session Replay lazy loading

Session Replay is now lazy-loaded using dynamic imports. The module loads only for sessions sampled for replay, reducing bundle size for others.

### npm setup

Ensure your bundler supports dynamic imports (code splitting). Most modern bundlers do:

- **Webpack**: [Code splitting docs](https://webpack.js.org/guides/code-splitting/#dynamic-imports)
- **Esbuild**: [Splitting option](https://esbuild.github.io/api/#splitting)
- **Rollup**: [Code splitting docs](https://rollupjs.org/tutorial/#code-splitting)
- **Parcel**: [Code splitting docs](https://parceljs.org/features/code-splitting)

### CDN setup

No code changes needed. The SDK dynamically loads an additional chunk when recording (e.g., `datadogRecorder-<hash>-datadog-rum.js`). Update CSP `script-src` rules if needed to allow the chunk.

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
- **CORS**: Add `tracestate` to your existing `Access-Control-Allow-Headers` if using the `tracecontext` propagator (do not replace the full list): `Access-Control-Allow-Headers: <existing-headers>, traceparent, tracestate`
- **CSP**: Allow the dynamically loaded Session Replay chunk (e.g., `datadogRecorder-*-datadog-rum.js`) in `script-src` rules.
- **Bundler config**: Ensure your bundler supports dynamic imports for Session Replay lazy loading.

## Common Mistakes

| Mistake                                                                           | What goes wrong                                                                                           | Fix                                                                                                                |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Defensively disabling `trackUserInteractions`, `trackResources`, `trackLongTasks` | Disables features the project needs — these now default to `true`, which is usually the desired behavior  | Only set these to `false` if the project explicitly did not want them; leave them unset to accept the new defaults |
| Missing `tracestate` in `Access-Control-Allow-Headers`                            | The `tracecontext` propagator now sends a `tracestate` header — cross-origin requests are blocked by CORS | Add `tracestate` alongside `traceparent` in your server's `Access-Control-Allow-Headers`                           |
| Not updating CSP `script-src` for the lazy-loaded Session Replay chunk            | Recording silently fails on CSP-restricted pages — the dynamic chunk is blocked                           | Allow `datadogRecorder-*-datadog-rum.js` in `script-src`                                                           |

## Verification checklist

After upgrading, confirm:

- [ ] SDK loads without console errors
- [ ] No references to removed options (`useCrossSiteSessionCookie`, `sendLogsAfterSessionExpiration`)
- [ ] Session Replay recordings working (if used)
- [ ] Distributed tracing working (no CORS errors from `tracestate` header)
- [ ] Bundle size decreased (IE11 polyfills removed)
- [ ] Long tasks still collected (now as Long Animation Frames on supported browsers)
- [ ] No TypeScript errors from `site` parameter typing
