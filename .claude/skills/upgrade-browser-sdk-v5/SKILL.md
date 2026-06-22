---
name: upgrade-browser-sdk-v5
description: Use when upgrading Datadog Browser SDK from v4 to v5, when encountering removed options like proxyUrl, sampleRate, replaySampleRate, premiumSampleRate, allowedTracingOrigins, or deprecated APIs like addRumGlobalContext, removeUser
---

# Upgrade Datadog Browser SDK to v5

Systematic migration guide from v4 to v5. Follow steps 1-7 in order. Each step includes a search pattern to find affected code.

## Step 1: Update SDK version

**CDN setup** — update script `src` URLs:

| v4 pattern                                               | v5 replacement                                           |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `datadoghq-browser-agent.com/us1/v4/datadog-rum.js`      | `datadoghq-browser-agent.com/us1/v5/datadog-rum.js`      |
| `datadoghq-browser-agent.com/us1/v4/datadog-logs.js`     | `datadoghq-browser-agent.com/us1/v5/datadog-logs.js`     |
| `datadoghq-browser-agent.com/us1/v4/datadog-rum-slim.js` | `datadoghq-browser-agent.com/us1/v5/datadog-rum-slim.js` |

Replace `us1` with your site: `eu1`, `us3`, `us5`, `ap1`. For US1-FED, the pattern is flat: `datadog-rum-v5.js` (no site prefix). Note: AP2 is not available for v5 — upgrade to v6 first if you need AP2.

Search: `grep -r "datadoghq-browser-agent.com.*v4" --include="*.html" --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx"`

**npm setup** — update `package.json` dependencies:

```
"@datadog/browser-rum": "^5.0.0"
"@datadog/browser-logs": "^5.0.0"
"@datadog/browser-rum-slim": "^5.0.0"
```

Then run your package manager (`npm install`, `yarn install`, etc.) and rebuild.

Also upgrade framework integrations to v5 if used: `@datadog/browser-rum-react`.

Search: `grep -r "@datadog/browser-" --include="package.json" .`

## Step 2: Replace deprecated init parameters

These v4 parameter names no longer exist in v5. Replace them:

| Deprecated parameter (v4) | Replacement (v5)          |
| ------------------------- | ------------------------- |
| `proxyUrl`                | `proxy`                   |
| `sampleRate`              | `sessionSampleRate`       |
| `allowedTracingOrigins`   | `allowedTracingUrls`      |
| `tracingSampleRate`       | `traceSampleRate`         |
| `trackInteractions`       | `trackUserInteractions`   |
| `premiumSampleRate`       | `sessionReplaySampleRate` |
| `replaySampleRate`        | `sessionReplaySampleRate` |

Search: `grep -rn 'proxyUrl\|sampleRate\|allowedTracingOrigins\|tracingSampleRate\|trackInteractions\|premiumSampleRate\|replaySampleRate' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

**Note**: `sampleRate` matches broadly. Look specifically for init config objects — `sessionSampleRate` is the v5 name for the session sampling rate.

## Step 3: Replace deprecated public APIs

These v4 API method names no longer exist in v5:

### RUM APIs

| Deprecated API (v4)             | Replacement (v5)                     |
| ------------------------------- | ------------------------------------ |
| `DD_RUM.removeUser`             | `DD_RUM.clearUser`                   |
| `DD_RUM.addRumGlobalContext`    | `DD_RUM.setGlobalContextProperty`    |
| `DD_RUM.removeRumGlobalContext` | `DD_RUM.removeGlobalContextProperty` |
| `DD_RUM.getRumGlobalContext`    | `DD_RUM.getGlobalContext`            |
| `DD_RUM.setRumGlobalContext`    | `DD_RUM.setGlobalContext`            |

### Logs APIs

| Deprecated API (v4)                 | Replacement (v5)                      |
| ----------------------------------- | ------------------------------------- |
| `DD_LOGS.addLoggerGlobalContext`    | `DD_LOGS.setGlobalContextProperty`    |
| `DD_LOGS.removeLoggerGlobalContext` | `DD_LOGS.removeGlobalContextProperty` |
| `DD_LOGS.getLoggerGlobalContext`    | `DD_LOGS.getGlobalContext`            |
| `DD_LOGS.setLoggerGlobalContext`    | `DD_LOGS.setGlobalContext`            |
| `logger.addContext`                 | `logger.setContextProperty`           |
| `logger.removeContext`              | `logger.removeContextProperty`        |

Search: `grep -rn 'removeUser\|addRumGlobalContext\|removeRumGlobalContext\|getRumGlobalContext\|setRumGlobalContext\|addLoggerGlobalContext\|removeLoggerGlobalContext\|getLoggerGlobalContext\|setLoggerGlobalContext\|\.addContext\|\.removeContext' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 4: Update Session Replay configuration

v5 changes several Session Replay defaults and behaviors:

### 4a. `defaultPrivacyLevel` changed to `"mask"`

In v4, the default was `mask-user-input`. In v5, **all content is masked by default**.

To preserve v4 behavior (only mask user input):

```js
DD_RUM.init({
  defaultPrivacyLevel: 'mask-user-input',
})
```

### 4b. Recording starts automatically

Sessions sampled for Session Replay are now automatically recorded. You no longer need to call `startSessionReplayRecording()`.

To preserve v4 behavior (manual recording start):

```js
DD_RUM.init({
  startSessionReplayRecordingManually: true,
})
```

### 4c. Default `sessionReplaySampleRate` is now `0`

In v4, the default replay sample rate was 100. In v5, it's `0` — no replays unless you set it explicitly.

**Action**: Ensure `sessionReplaySampleRate` is explicitly set in your init config:

```js
DD_RUM.init({
  sessionReplaySampleRate: 100, // or your desired rate
})
```

### 4d. `trackResources` and `trackLongTasks` must be explicit

When using `sessionReplaySampleRate` (instead of the removed `replaySampleRate` or `premiumSampleRate`), resources and long tasks are no longer collected by default. You must enable them explicitly:

```js
DD_RUM.init({
  sessionReplaySampleRate: 100,
  trackResources: true,
  trackLongTasks: true,
})
```

Search: `grep -rn 'sessionReplaySampleRate\|startSessionReplayRecording\|defaultPrivacyLevel\|trackResources\|trackLongTasks' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 5: Update changed APIs and behaviors

### 5a. `beforeSend` must return a boolean

`beforeSend` callback functions should return `true` to keep the event or `false` to discard it. If no value is returned, the event is kept. This resolves TypeScript compilation errors.

```js
beforeSend: (event, context) => {
  // return true to keep, false to discard
  return true
}
```

### 5b. `beforeSend` action context: `context.event` → `context.events`

With frustration signals, an action event can be associated with multiple DOM events. `context.event` is replaced by `context.events` (array).

```js
// v4
beforeSend: (event, context) => {
  if (event.type === 'action') {
    const domEvent = context.event
  }
}

// v5
beforeSend: (event, context) => {
  if (event.type === 'action') {
    const domEvents = context.events // array
  }
}
```

### 5c. `beforeSend` performance entry is now a `PerformanceEntry` object

The `performanceEntry` in `beforeSend` context is now the raw `PerformanceEntry` object, not a JSON representation. The `PerformanceEntryRepresentation` type has been removed.

### 5d. `startTime` removed from XHR `beforeSend` context

The `context.startTime` property has been removed from XHR resource `beforeSend` context. Use the `performanceEntry` instead.

### 5e. `view.in_foreground_periods` removed from `beforeSend`

This attribute is now computed by the backend. Remove any `beforeSend` code that accesses `view.in_foreground_periods`.

### 5f. Frustration signals collected automatically

Set `trackUserInteractions: true` to collect all user interactions, including frustration signals. The `trackFrustrations` parameter is no longer needed.

### 5g. Resource method names are uppercase

Resource `method` field is now always uppercase (e.g., `GET`, `POST`). Update any dashboards or monitors filtering on `resource.method`.

### 5h. `session.plan` field only on session events

The `session.plan` field is now only available on session events, not on all event types. Update any dashboard or monitor queries that reference `session.plan` on non-session events.

Search: `grep -rn 'beforeSend\|trackFrustrations\|PerformanceEntryRepresentation\|in_foreground_periods\|context\.event\b\|startTime' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 6: Handle trusted events

v5 only listens to user-generated (trusted) events. Script-generated events are ignored by default.

If you rely on programmatic events (e.g., `dispatchEvent`), add the `__ddIsTrusted` attribute:

```js
const click = new Event('click')
click.__ddIsTrusted = true
document.dispatchEvent(click)
```

Or allow all untrusted events globally:

```js
DD_RUM.init({
  allowUntrustedEvents: true,
})
```

Search: `grep -rn 'dispatchEvent\|new Event\|new MouseEvent\|new KeyboardEvent\|\.click()' --include="*.js" --include="*.ts" --include="*.tsx" --include="*.jsx" --include="*.html" --include="*.vue" --include="*.svelte"`

## Step 7: Update infrastructure

### CSP `connect-src` domains changed

v5 sends data to new intake domains. Update your Content Security Policy:

| Datadog site | New `connect-src` domain                   |
| ------------ | ------------------------------------------ |
| US1          | `https://browser-intake-datadoghq.com`     |
| US3          | `https://browser-intake-us3-datadoghq.com` |
| US5          | `https://browser-intake-us5-datadoghq.com` |
| EU1          | `https://browser-intake-datadoghq.eu`      |
| US1-FED      | `https://browser-intake-ddog-gov.com`      |
| US2-FED      | `https://browser-intake-us2-ddog-gov.com`  |
| AP1          | `https://browser-intake-ap1-datadoghq.com` |

### CORS headers for distributed tracing

v5 adds `tracecontext` as a default propagator. If you use `allowedTracingUrls`, your server must accept the `traceparent` header:

```
Access-Control-Allow-Headers: traceparent
```

### Logs: `error.origin` removed

Update dashboards/monitors using `error.origin` to use `origin` instead.

### Logs: console error prefix removed

The `"console error:"` prefix is removed from log messages. Update queries using this prefix to use `@origin:console` instead.

### Logs: main logger decoupled

Runtime errors, network logs, report logs, and console logs no longer inherit the main logger's context, level, or handler. Use global context and dedicated init parameters instead.

## Common Mistakes

| Mistake                                                                                      | What goes wrong                                                                                                             | Fix                                                                                                      |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Setting `sessionReplaySampleRate > 0` without enabling `trackResources` and `trackLongTasks` | Resources and long tasks are silently not collected — they no longer default to `true` when using `sessionReplaySampleRate` | Always add `trackResources: true, trackLongTasks: true` alongside any non-zero `sessionReplaySampleRate` |
| Using `context.event` instead of `context.events` in `beforeSend` for action events          | Action context property renamed — `context.event` is `undefined`, DOM event details are lost                                | Update to `context.events` (array); iterate if you need all associated DOM events                        |
| Not updating CSP `connect-src` to the new v5 intake domains                                  | SDK silently fails to send data — old intake domains are no longer valid                                                    | Update `connect-src` to the v5 intake domain for your site (see Step 7)                                  |

## Verification checklist

After upgrading, confirm:

- [ ] SDK loads without console errors
- [ ] No references to removed init parameters (`proxyUrl`, `sampleRate`, `replaySampleRate`, etc.)
- [ ] No references to removed APIs (`addRumGlobalContext`, `removeUser`, etc.)
- [ ] `beforeSend` callbacks return boolean values
- [ ] `beforeSend` action handlers use `context.events` (not `context.event`)
- [ ] `trackResources` and `trackLongTasks` explicitly set if using `sessionReplaySampleRate`
- [ ] Session Replay recording works (if `sessionReplaySampleRate` > 0)
- [ ] Distributed tracing working (no CORS errors from `traceparent` header)
- [ ] CSP `connect-src` updated to new intake domains
- [ ] Dashboards/monitors updated for uppercase `resource.method`
- [ ] No queries using `error.origin` (use `origin` instead)
