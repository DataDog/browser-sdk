---
name: upgrade-browser-sdk-v7
description: Use when upgrading Datadog Browser SDK from v6 to v7, when encountering removed options like betaEncodeCookieOptions, allowFallbackToLocalStorage, trackBfcacheViews, usePciIntake, changed APIs like forwardErrorsToLogs, startDurationVital, stopDurationVital, or when a project references datadoghq-browser-agent.com CDN with /v6/ paths
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

Replace `us1` with your site: `eu1`, `us3`, `us5`, `ap1`, `ap2`. For US1-FED, the pattern is flat with no site prefix: `datadog-rum-v7.js`, `datadog-logs-v7.js`, `datadog-rum-slim-v7.js`.

Search: `grep -r "datadoghq-browser-agent.com.*v6" --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"`

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

Search: `grep -rn 'betaEncodeCookieOptions\|allowFallbackToLocalStorage\|trackBfcacheViews\|trackEarlyRequests\|betaTrackActionsInShadowDom\|usePciIntake' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 4: Update changed APIs

### 4a. `forwardErrorsToLogs` + `forwardConsoleLogs` (Logs)

These are now **independent**. In v6, `forwardErrorsToLogs: true` had a side effect: it also forwarded `console.error()` calls to Logs. In v7, that side effect is removed.

- `forwardErrorsToLogs` — controls forwarding of **unhandled errors** (uncaught exceptions, unhandled rejections) and **network errors** to Logs. **Keep this unchanged.**
- `forwardConsoleLogs` — controls forwarding of **`console.error()` calls** to Logs. Add `'error'` here to restore the v6 side effect.

**Only add `forwardConsoleLogs: ['error']` when `forwardErrorsToLogs` is `true` or omitted** — in v6 the side effect only applied when the option was enabled (explicitly or via the default). If `forwardErrorsToLogs: false`, there was no side effect to restore; leave it unchanged.

```js
// v6 — forwardErrorsToLogs: true (explicit or omitted, which defaults to true)
DD_LOGS.init({
  forwardErrorsToLogs: true,
  forwardConsoleLogs: ['warn'], // example: existing levels
})

// v7 — add 'error' to restore the side effect; preserve any existing levels
DD_LOGS.init({
  forwardErrorsToLogs: true, // unchanged
  forwardConsoleLogs: ['warn', 'error'], // add 'error'
})

// v6 — forwardErrorsToLogs: false → no side effect existed; nothing to add
DD_LOGS.init({
  forwardErrorsToLogs: false, // leave unchanged, do NOT add forwardConsoleLogs: ['error']
})
```

Do **not** replace `forwardErrorsToLogs` with `forwardConsoleLogs` — they control different things.

Search for explicit config: `grep -rn "forwardErrorsToLogs" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html"`

Also search for Logs init calls that may be relying on the default (`forwardErrorsToLogs` defaults to `true` in v6, so omitting it still had the side effect): `grep -rn "DD_LOGS\.init\|datadogLogs\.init" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

For any Logs init call where `forwardErrorsToLogs` is `true` or omitted, and `forwardConsoleLogs` does not already include `'error'` or `'all'`, add `'error'` to preserve v6 behavior.

### 4b. `startDurationVital` / `stopDurationVital` (RUM)

The `DurationVitalReference` object is replaced by a `vitalKey` string. **`startDurationVital` now returns `void`** — the v7 API is fire-and-forget; the vital name string is all you need.

```js
// v5/v6 — ref-based (CDN: DD_RUM, npm: datadogRum)
var ref = DD_RUM.startDurationVital('checkout_flow')
// ... async work ...
DD_RUM.stopDurationVital(ref)

// v7
DD_RUM.startDurationVital('checkout_flow', { vitalKey: 'checkout_flow' })
DD_RUM.stopDurationVital('checkout_flow', { vitalKey: 'checkout_flow' })
```

**This silently breaks in CDN/plain JS projects.** TypeScript catches it with a type error; plain JS does not. `ref` becomes `undefined` and `stopDurationVital(undefined)` is a no-op — the vital starts but never stops, so the event is never emitted.

**Step 1 — find all `startDurationVital`/`stopDurationVital` usages** (both CDN and npm patterns, all file types):

```
grep -rn 'startDurationVital\|stopDurationVital\|DurationVitalReference' \
  --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" \
  --include="*.html" --include="*.svelte" --include="*.vue"
```

**Step 2 — find every variable that captures the return value** (this is the failure point):

```
grep -rEn '(var|const|let)\s+\w+\s*=\s*.+startDurationVital|[\w.]+\s*=\s*(window\.)?DD_RUM\.startDurationVital|[\w.]+\s*=\s*datadogRum\.startDurationVital' \
  --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" \
  --include="*.svelte" --include="*.vue"
```

For every match: remove the variable assignment and update all uses of that variable in the corresponding `stopDurationVital` call to pass the vital name string directly.

**Step 3 — if the SDK is wrapped in a utility** (e.g. `startTiming` / `stopTiming`):

1. Update the wrapper — pass `vitalKey` to `startDurationVital`, return nothing.
2. Find callers that capture the wrapper return value:

```
grep -rEn '(var|const|let)\s+\w+\s*=\s*.+[Ss]tart[Tt]iming|(var|const|let)\s+\w+\s*=\s*.+[Ss]tart.+[Vv]ital' \
  --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" \
  --include="*.html" --include="*.svelte" --include="*.vue"
```

3. Remove the capture and update the stop call to pass the vital name string directly:

```js
// Caller — before
var ref = startTiming('checkout_flow')
stopTiming(ref) // undefined in v7 → vital never stops

// Caller — after
startTiming('checkout_flow')
stopTiming('checkout_flow')
```

### 4c. Plugin API: `strategy` removed (RUM)

The `strategy` field has been removed from the plugin API. If you use `@datadog/browser-rum-react` or other plugin integrations, upgrade them to v7.

Search: `grep -rn "strategy" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"` (look for plugin definitions)

## Step 5: Review behavioral changes (no code required, but may need attention)

These are **default changes** — no code breaks, but behavior differs from v6:

| Change                                                               | Impact                                                                                                                                                                                                                                                                                                                                                                                    | Action if needed                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultPrivacyLevel` defaults to `"mask-user-input"` (was `"mask"`) | Less restrictive masking out of the box. Only user input is masked.                                                                                                                                                                                                                                                                                                                       | Set `defaultPrivacyLevel: "mask"` to preserve full masking.                                                                                                                                                                                        |
| `enablePrivacyForActionName` defaults to `true`                      | Action names are derived from `textContent` (not `innerText`) — CSS `text-transform` is no longer applied. A button with `style="text-transform: capitalize"` and raw text `"audio"` yields `"Audio"` in v6 but `"audio"` in v7. Names may also be masked based on privacy level. **Note:** setting this to `false` does not restore CSS-aware extraction — v7 always uses `textContent`. | Add `data-dd-action-name` attributes to elements whose display names relied on CSS transforms, or update monitors to match raw text values. Use the [Datadog build plugin](https://github.com/DataDog/build-plugins) for annotation-based control. |
| `propagateTraceBaggage` defaults to `true`                           | CORS: cross-origin APIs must allow `baggage` header.                                                                                                                                                                                                                                                                                                                                      | Add `"baggage"` to `Access-Control-Allow-Headers`, or set `propagateTraceBaggage: false`.                                                                                                                                                          |
| Deterministic sampling                                               | Sampling computed from session ID + rate, not stored. Consistent across pages.                                                                                                                                                                                                                                                                                                            | Review if you use different sample rates on different pages.                                                                                                                                                                                       |
| FID removed                                                          | First Input Delay no longer collected.                                                                                                                                                                                                                                                                                                                                                    | Use INP (Interaction to Next Paint) instead.                                                                                                                                                                                                       |
| `session_renewal` view loading type                                  | Session-renewed views have `@view.loading_type:session_renewal` instead of `route_change`.                                                                                                                                                                                                                                                                                                | Update dashboards/monitors filtering on `@view.loading_type`.                                                                                                                                                                                      |
| Document resource `initiatorType` changed                            | `"initial_document"` becomes `"navigation"`. Duration may differ slightly.                                                                                                                                                                                                                                                                                                                | Update any code inspecting document resource `performanceEntry`.                                                                                                                                                                                   |
| Action names may change                                              | Tree walker + `textContent` always used in v7 (including Shadow DOM) — CSS `text-transform` is never reflected regardless of `enablePrivacyForActionName`. Monitors with case-sensitive filters on visually-transformed names may break.                                                                                                                                                  | Add `data-dd-action-name` attributes to affected elements, or update monitors to match raw text values.                                                                                                                                            |
| Cancelled request errors removed (Logs)                              | Aborted fetch/XHR no longer generate network error logs.                                                                                                                                                                                                                                                                                                                                  | No action needed — reduces noise.                                                                                                                                                                                                                  |
| Logs always requires session storage                                 | Without cookies or localStorage, Logs SDK won't start.                                                                                                                                                                                                                                                                                                                                    | Use `sessionPersistence: 'memory'` for worker environments.                                                                                                                                                                                        |
| Session Replay: Change Records                                       | New serialization format. More accurate, less bandwidth.                                                                                                                                                                                                                                                                                                                                  | Update if you depend on raw segment format.                                                                                                                                                                                                        |
| Async chunk names prefixed with `datadog`                            | e.g., `datadogRecorder-<hash>-datadog-rum.js`, `datadogProfiler-<hash>-datadog-rum.js`.                                                                                                                                                                                                                                                                                                   | Update CSP `script-src` rules or caching configs (allow `datadog*-datadog-rum.js`).                                                                                                                                                                |

## Step 6: Update infrastructure

- **CSP**:
  - Add `crossorigin` to script-src.
  - Update chunk names like `datadog*-datadog-rum.js` (e.g. `datadogRecorder`, `datadogProfiler`).
  - If you removed `usePciIntake`, update CSP for standard intake domain.
- **Cookies**: Add `_dd_s_v2` to cookie allowlists. The SDK auto-migrates from `_dd_s` on first load. Rollback to v6 starts new sessions.
- **CORS**: Search for tracing config: `grep -rn "allowedTracingUrls\|propagateTraceBaggage" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`. For any project with `allowedTracingUrls` and no explicit `propagateTraceBaggage: false`, add `"baggage"` to your existing `Access-Control-Allow-Headers` on traced origins — or set `propagateTraceBaggage: false` to opt out.
- **Browser support**: Minimum Chrome 80+, Firefox 78+, Safari 14+ (ES2020). ~0.048% less coverage.

## Common Mistakes

| Mistake                                                                    | What goes wrong                                                                                                     | Fix                                                                                                                                                |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replacing `forwardErrorsToLogs: true` with `forwardConsoleLogs: ['error']` | Unhandled errors (uncaught exceptions, unhandled rejections) stop being forwarded to Logs                           | Keep `forwardErrorsToLogs: true` unchanged and add `forwardConsoleLogs: ['error']` alongside it — they control different things                    |
| Updating `startDurationVital` wrapper but not its callers                  | Callers pass the old ref variable (now `undefined`) to `stopDurationVital` — vital never stops, event never emitted | After updating the wrapper, search for every caller that captures the return value and update the stop call to pass the vital name string directly |
| Missing `vitalKey` option on `stopDurationVital`                           | v7 `stopDurationVital` requires `{ vitalKey: string }` to identify which vital to stop                              | Pass the same string used in `startDurationVital`: `stopDurationVital('name', { vitalKey: 'name' })`                                               |
| Not checking CDN/plain JS files for ref-based vitals                       | TypeScript projects surface this as a type error; plain JS silently breaks                                          | Run the Step 2 grep explicitly — don't rely on type errors to find all sites                                                                       |

## Verification checklist

After upgrading, confirm:

- [ ] SDK loads without console errors
- [ ] `crossorigin="anonymous"` on all CDN script tags
- [ ] No references to removed options in init config
- [ ] Session Replay recordings working (if used)
- [ ] Distributed tracing working (no CORS errors from baggage header)
- [ ] No `_dd_s` cookie remaining after first page load (should be `_dd_s_v2`)
- [ ] Action names acceptable under new privacy defaults
- [ ] No variables capturing the return value of `startDurationVital` (or wrappers around it) — all stop calls use the vital name string directly
