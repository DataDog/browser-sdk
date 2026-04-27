---
name: upgrade-browser-sdk-v7
description: Use when upgrading Datadog Browser SDK from v6 to v7, when encountering removed options like betaEncodeCookieOptions, allowFallbackToLocalStorage, trackBfcacheViews, usePciIntake, or when a project references datadoghq-browser-agent.com CDN with /v6/ paths
---

# Upgrade Datadog Browser SDK to v7

Systematic migration guide from v6 to v7. Follow steps 1-6 in order. Each step includes a search pattern to find affected code.

## Step 1: Update SDK version

**CDN setup** — update script `src` URLs:

| v6 pattern                                               | v7 replacement                                           |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `datadoghq-browser-agent.com/us1/v6/datadog-rum.js`      | `datadoghq-browser-agent.com/us1/v7/datadog-rum.js`      |
| `datadoghq-browser-agent.com/us1/v6/datadog-logs.js`     | `datadoghq-browser-agent.com/us1/v7/datadog-logs.js`     |
| `datadoghq-browser-agent.com/us1/v6/datadog-rum-slim.js` | `datadoghq-browser-agent.com/us1/v7/datadog-rum-slim.js` |

Replace `us1` with your site: `eu1`, `us3`, `us5`, `ap1`. For US1-FED, the pattern is flat: `datadog-rum-v7.js` (no site prefix).

Search: `grep -r "datadoghq-browser-agent.com.*v6" --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx"`

**npm setup** — update `package.json` dependencies:

```
"@datadog/browser-rum": "^7.0.0"
"@datadog/browser-logs": "^7.0.0"
"@datadog/browser-rum-slim": "^7.0.0"
```

Then run your package manager (`npm install`, `yarn install`, etc.) and rebuild.

Also upgrade framework integrations to v7: `@datadog/browser-rum-react`, `@datadog/browser-rum-angular`, `@datadog/browser-rum-vue`, `@datadog/browser-rum-nextjs`.

Search: `grep -r "@datadog/browser-" package.json`

## Step 2: Add `crossorigin="anonymous"` (CDN only)

v7 CDN bundles use ESM dynamic imports. **Every** `<script>` tag loading the SDK must have `crossorigin="anonymous"`:

```html
<script src="https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum.js" crossorigin="anonymous"></script>
```

For **dynamically created** script elements:

```js
const script = document.createElement('script')
script.crossOrigin = 'anonymous' // Must set BEFORE setting src
script.src = 'https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum.js'
```

Search: `grep -rn "datadoghq-browser-agent" --include="*.html" --include="*.js" --include="*.ts"`

Check every match for the `crossorigin` attribute (HTML) or `.crossOrigin` property (JS).

## Step 3: Remove deprecated options

Search init calls for these options and apply replacements:

### Removed from Core (affects both RUM and Logs)

| Option                        | Action                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| `betaEncodeCookieOptions`     | Delete. Cookie encoding is always enabled.                     |
| `allowFallbackToLocalStorage` | Replace with `sessionPersistence: ['cookie', 'local-storage']` |

### Removed from RUM

| Option                        | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| `trackBfcacheViews`           | Delete. BFCache views are always tracked.        |
| `trackEarlyRequests`          | Delete. Early requests are always collected.     |
| `betaTrackActionsInShadowDom` | Delete. Shadow DOM action tracking is always on. |

### Removed from Logs

| Option         | Action                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `usePciIntake` | Delete. Standard intake is now PCI compliant. Update CSP if you had PCI-specific domains allowlisted. |

Search: `grep -rn "betaEncodeCookieOptions\|allowFallbackToLocalStorage\|trackBfcacheViews\|trackEarlyRequests\|betaTrackActionsInShadowDom\|usePciIntake" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.html"`

## Step 4: Update changed APIs

### 4a. `forwardErrorsToLogs` + `forwardConsoleLogs` (Logs)

These are now **independent**. In v6, `forwardErrorsToLogs: true` silently forwarded `console.error()`. In v7, it only controls unhandled errors.

**If you use `forwardErrorsToLogs: true`**, add `"error"` to your `forwardConsoleLogs` array to preserve v6 behavior:

```js
DD_LOGS.init({
  forwardErrorsToLogs: true,
  forwardConsoleLogs: ['error', 'warn'], // add 'error' explicitly
})
```

Search: `grep -rn "forwardErrorsToLogs" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.html"`

### 4b. `startDurationVital` / `stopDurationVital` (RUM)

The `DurationVitalReference` object is replaced by a `vitalKey` string:

```js
// v6
const ref = DD_RUM.startDurationVital('checkout')
DD_RUM.stopDurationVital(ref)

// v7
DD_RUM.startDurationVital('checkout', { vitalKey: 'checkout-key' })
DD_RUM.stopDurationVital('checkout', { vitalKey: 'checkout-key' })
```

Search: `grep -rn "startDurationVital\|stopDurationVital\|DurationVitalReference" --include="*.js" --include="*.ts" --include="*.tsx"`

### 4c. Plugin API: `strategy` removed (RUM)

The `strategy` field has been removed from the plugin API. If you use `@datadog/browser-rum-react` or other plugin integrations, upgrade them to v7.

Search: `grep -rn "strategy" --include="*.js" --include="*.ts" --include="*.tsx"` (look for plugin definitions)

## Step 5: Review behavioral changes (no code required, but may need attention)

These are **default changes** — no code breaks, but behavior differs from v6:

| Change                                                               | Impact                                                                                     | Action if needed                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `defaultPrivacyLevel` defaults to `"mask-user-input"` (was `"mask"`) | Less restrictive masking out of the box. Only user input is masked.                        | Set `defaultPrivacyLevel: "mask"` to preserve full masking.                                                          |
| `enablePrivacyForActionName` defaults to `true`                      | Click action names follow privacy level. May be masked.                                    | Use the [Datadog build plugin](https://github.com/DataDog/build-plugins) or set `enablePrivacyForActionName: false`. |
| `propagateTraceBaggage` defaults to `true`                           | CORS: cross-origin APIs must allow `baggage` header.                                       | Add `"baggage"` to `Access-Control-Allow-Headers`, or set `propagateTraceBaggage: false`.                            |
| Deterministic sampling                                               | Sampling computed from session ID + rate, not stored. Consistent across pages.             | Review if you use different sample rates on different pages.                                                         |
| FID removed                                                          | First Input Delay no longer collected.                                                     | Use INP (Interaction to Next Paint) instead.                                                                         |
| `session_renewal` view loading type                                  | Session-renewed views have `@view.loading_type:session_renewal` instead of `route_change`. | Update dashboards/monitors filtering on `@view.loading_type`.                                                        |
| Document resource `initiatorType` changed                            | `"initial_document"` becomes `"navigation"`. Duration may differ slightly.                 | Update any code inspecting document resource `performanceEntry`.                                                     |
| Action names may change                                              | Tree walker strategy always used (including Shadow DOM).                                   | Review if you have monitors based on specific action names.                                                          |
| Cancelled request errors removed (Logs)                              | Aborted fetch/XHR no longer generate network error logs.                                   | No action needed — reduces noise.                                                                                    |
| Logs always requires session storage                                 | Without cookies or localStorage, Logs SDK won't start.                                     | Use `sessionPersistence: 'memory'` for worker environments.                                                          |
| Session Replay: Change Records                                       | New serialization format. More accurate, less bandwidth.                                   | Update if you depend on raw segment format.                                                                          |
| Async chunk names prefixed with `datadog`                            | e.g., `datadog-rum-recorder.js`.                                                           | Update CSP `script-src` rules or caching configs.                                                                    |

## Step 6: Update infrastructure

- **CSP**: Add `crossorigin` to script-src. Update chunk names (`datadog-rum-recorder.js`). If you removed `usePciIntake`, update CSP for standard intake domain.
- **Cookies**: Add `_dd_s_v2` to cookie allowlists. The SDK auto-migrates from `_dd_s` on first load. Rollback to v6 starts new sessions.
- **CORS** (if using `allowedTracingUrls`): Add `"baggage"` to `Access-Control-Allow-Headers` on traced origins — or set `propagateTraceBaggage: false`.
- **Browser support**: Minimum Chrome 80+, Firefox 78+, Safari 14+ (ES2020). ~0.048% less coverage.

## Verification checklist

After upgrading, confirm:

- [ ] SDK loads without console errors
- [ ] `crossorigin="anonymous"` on all CDN script tags
- [ ] No references to removed options in init config
- [ ] Session Replay recordings working (if used)
- [ ] Distributed tracing working (no CORS errors from baggage header)
- [ ] No `_dd_s` cookie remaining after first page load (should be `_dd_s_v2`)
- [ ] Action names acceptable under new privacy defaults
