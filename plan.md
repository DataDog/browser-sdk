# Enable `@datadog/browser-logs` in Service Workers (SW)

This document is the implementation checklist to make the Logs package fully functional when executed inside a Service Worker context.

---

## 0. Configuration parameter support matrix

| Parameter | Required | What it does | SW Support Level | Notes / Why |
|-----------|----------|--------------|------------------|-------------|
| `clientToken`, `site` | **yes** | Credentials for intake | **Fully** | No browser-specific APIs required. |
| `service`, `env`, `version` | no | Metadata for logs | **Fully** | Simple config pass-through. |
| `forwardErrorsToLogs` | no | Sends runtime errors, console errors, and network errors (Fetch/XHR ≥ 500 or failed). | **Partial** | Uses `self.onerror` / `self.onunhandledrejection` and patches `console.*`. Fetch errors fully supported; XHR not available in SW. |
| `forwardConsoleLogs` | no | Captures console.* calls | **Fully** | `console` exists in workers; we monkey-patch `self.console`. |
| `forwardReports` | no | Uses Reporting API (`report-error`, `network-error`, …) | **Limited** | `ReportingObserver` can be created, but most report types (CSP, deprecation) originate from documents, not workers, so expect few/no reports. |
| `sessionSampleRate` | no | % of sessions to sample | **Fully** | Apply sampling on worker start; without persistent session, each SW activation counts as a new session. |
| `trackingConsent` | no | Control logging based on user consent | **Potential** | Honour initial state; expose method to update via `postMessage` so pages can relay consent to the worker. |
| `silentMultipleInit` | no | Ignore subsequent `init()` calls | **Fully** | Pure runtime flag. |
| `proxy` | no | Route events through Datadog proxy | **Fully** | URL manipulation only. |
| `usePciIntake` | no | Send to PCI-compliant intake | **Fully** | URL & headers. |
| `telemetrySampleRate` | no | % of telemetry events sent | **Fully** | No DOM deps. |
| `storeContextsAcrossPages` | — | Persist context across navigations | N/A | Workers do not navigate pages. |
| `beforeSend` | no | User hook to mutate events | **Fully** | Callback executed in SW. |
| `allowUntrustedEvents` | no | Allow synthetic DOM events | N/A | There is no DOM event stream in workers; option ignored. |
| `allowedTrackingOrigins` | not yet | Restrict which origins are tracked | **Fully** | Check `self.location.origin` (worker scope) or client origins against the allowed list—same logic reused. |
| `allowFallbackToLocalStorage` | no | Use localStorage when cookies unavailable | **None** | `localStorage` not present in workers; future alternative could be IndexedDB. |
| `datacenter` | no | Explicit DC selection | **Fully** | Config only. |
| `sessionPersistence` | no | Choose cookie vs localStorage | **None** | Cookies/LocalStorage unavailable; initial implementation uses in-memory session only; IDB persistence is future work. |
| `trackAnonymousUser` | — | Persist anonymous user id across sessions | **Potential** | Without cookies/storage, anonymous ID resets on each worker start; could be provided via messaging or IDB. |
| `trackSessionAcrossSubdomains` | no | Persist cookie across sub-domains | N/A | Not relevant to SW. |
| `usePartitionedCrossSiteSessionCookie` | no | SameSite=None; Secure; Partitioned | **None** | Cookie-specific. |
| `useSecureSessionCookie` | no | Secure attribute on cookie | **None** | Cookie-specific. |
| `replica` | no | Send a copy of each log to a secondary intake | **Fully** | Reuse core logic: build secondary config and send via same fetch-based transport. |

> _Legend_: **Fully** – will work after current plan; **Partial** – some features missing; **Potential** – possible future work; **None** – not supported; N/A – not relevant in SW.

---

## 1. Global utilities

1. **`isServiceWorkerContext` helper**  
   - File: `packages/core/src/tools/isServiceWorkerContext.ts`  
   - Returns `true` when running in a Service Worker.

2. **`globalVar` alias**  
   - Augment `packages/core/src/tools/getGlobalObject.ts` to export `globalVar` (the result of `getGlobalObject()`).  
   - Use `globalVar` instead of hard-coded `window` references across the codebase.

---

## 2. Core package adjustments

| Area | Action |
|------|--------|
| **Event listeners** | In `browser/addEventListener.ts`, swap `window` for `globalVar` and default event target to `self` when in SW. |
| **HTTP transport** | In `transport/httpRequest.ts`, guard `navigator.sendBeacon`; fall back to `fetch` when undefined in SW. |
| **Session/visibility tracking** | In `session/sessionManager.ts`, make `trackVisibility`, `trackResume`, and activity listeners no-ops inside SW. |

---

## 3. Logs package adjustments

1. **Contexts**  
   - `domain/contexts/commonContext.ts` – guard `document.referrer` and use `globalVar.location.href`.

2. **Network error collection**  
   - `domain/networkError/networkErrorCollection.ts` – replace `window.TextDecoder` with `globalVar.TextDecoder` and skip XHR branch when `XMLHttpRequest` is undefined (SW).

3. **Runtime error collection**  
   - Listen to `self.addEventListener('error'| 'unhandledrejection')` in SW.

4. **Session manager stub**  
   - Add `startLogsSessionManagerForSw()` returning a stubbed manager always considered “tracked”.  
   - In `boot/startLogs.ts`, choose the stub when `isServiceWorkerContext()` is true.

5. **RUM bridge**  
   - In `domain/contexts/rumInternalContext.ts`, return `undefined` immediately in SW.

---

## 4. Polyfills / shims (minimal)

- Provide a **`window` alias** inside SW if absent: `globalVar.window = globalVar;`  
- Provide a stub `document` object with `{ referrer: '' }` if code accesses it.

---

## 5. Build & packaging

1. **New SW entry point**  
   - File: `packages/logs/src/entries/sw.ts` exporting `datadogLogs` (same API as `entries/main.ts`).
2. **Package exports**  
   - In each package `package.json`, add:
     ```json
     "exports": {
       ".": "./dist/index.js",
       "./sw": "./dist/sw.mjs"
     }
     ```
3. **Build config**  
   - Ensure Rollup/TypeScript build produces an ESM bundle without DOM typings.

---

## 6. Manual validation steps (pre-E2E)

1. Build SDK: `yarn build`.
2. Load a blank HTML page, register a Service Worker that imports the new SW bundle, and call `datadogLogs.init()`.
3. Trigger console log, runtime error, fetch failure, and verify logs appear in Datadog.

---

## 7. Future work (out of scope now)

- Automated unit & E2E tests.
- Edge-case handling (offline, SW updates, multiple clients).
- Documentation/README updates. 