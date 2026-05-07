# RUM v6 vs v8: Field-by-Field Comparison Report

> Generated from live sandbox comparison (`sandbox/v8/`).
> Both SDKs running on the same page, same user interactions, events captured via `__ddBrowserSdkExtensionCallback`.
> Classification by `application.id` (`playground-app-v6` vs `playground-app-v8`).

---

## Summary

| Event Type | Shared Fields | Only in v6 | Only in v8 | Parity |
|---|---|---|---|---|
| **Error** | 35 | 9 | 0 | **80%** (37/46) |
| **View** | 63 | 20 | 0 | **77%** (66/86) |
| **Resource** | 31 | 11 | 5 | **73%** (45/56) |

All v6-only fields fall into known categories (Session Replay, deprecated metrics, internal config, or intentionally skipped). **v8 sends zero unexpected fields that v6 doesn't.**

---

## Error Events

### Matching fields (35 of 46)

Both SDKs produce identical structure for:

```
_dd.browser_sdk_version    _dd.configuration.session_sample_rate
_dd.configuration.trace_sample_rate    _dd.drift    _dd.format_version
application.id    connectivity.effective_type    connectivity.status
context.report    date    ddtags    display.viewport.height
display.viewport.width    error.causes    error.fingerprint
error.handling    error.handling_stack    error.id    error.message
error.source    error.source_type    error.stack    error.type
service    session.id    session.type    source    tab.id    type
usr.anonymous_id    version    view.id    view.in_foreground
view.name    view.referrer    view.url
```

### Only in v6 (9 fields)

| Field | Value | Category |
|---|---|---|
| `_dd.configuration.session_replay_sample_rate` | `0` | Session Replay |
| `_dd.configuration.profiling_sample_rate` | `0` | Internal config |
| `_dd.configuration.beta_encode_cookie_options` | `false` | Removed in v7 |
| `_dd.sdk_name` | `"rum"` | Intentionally skipped |
| `session.has_replay` | `undefined` | Session Replay |
| `session.sampled_for_replay` | `undefined` | Session Replay |
| `session.is_active` | `undefined` | Session Replay (only set on views) |
| `error.component_stack` | `undefined` | Framework-specific (rum-react/vue) |
| `error.csp` | `undefined` | CSP violation edge case |

### Only in v8: none

### Value differences (expected)

| Field | Notes |
|---|---|
| `error.stack` | Different line numbers — both SDKs call `addError()` from different lines in the same script |
| `error.handling_stack` | Different capture points — v6 captures at `addError()` call site, v8 captures at `captureHandlingStack()` in the processor |

---

## View Events

### Matching fields (63 of 86)

Both SDKs produce identical structure for:

```
_dd.browser_sdk_version    _dd.cls.device_pixel_ratio
_dd.configuration.session_sample_rate    _dd.configuration.trace_sample_rate
_dd.document_version    _dd.drift    _dd.format_version
_dd.page_states    application.id    connectivity.effective_type
connectivity.status    date    ddtags    device.locale    device.locales
device.time_zone    display.viewport.height    display.viewport.width
service    session.id    session.is_active    session.type    source
tab.id    type    usr.anonymous_id    version
view.action.count    view.cumulative_layout_shift
view.cumulative_layout_shift_target_selector
view.cumulative_layout_shift_time    view.dom_complete
view.dom_content_loaded    view.dom_interactive    view.error.count
view.first_byte    view.first_contentful_paint    view.frustration.count
view.id    view.interaction_to_next_paint
view.interaction_to_next_paint_target_selector
view.interaction_to_next_paint_time    view.is_active
view.largest_contentful_paint
view.largest_contentful_paint_target_selector    view.load_event
view.loading_time    view.loading_type    view.long_task.count
view.name    view.performance.cls.current_rect.height
view.performance.cls.current_rect.width
view.performance.cls.current_rect.x    view.performance.cls.current_rect.y
view.performance.cls.previous_rect.height
view.performance.cls.previous_rect.width
view.performance.cls.previous_rect.x
view.performance.cls.previous_rect.y    view.performance.cls.score
view.performance.cls.target_selector
view.performance.cls.timestamp    view.referrer
view.resource.count    view.time_spent    view.url
```

### Only in v6 (20 fields)

| Field | Value | Category |
|---|---|---|
| `_dd.configuration.session_replay_sample_rate` | `0` | Session Replay |
| `_dd.configuration.profiling_sample_rate` | `0` | Internal config |
| `_dd.configuration.beta_encode_cookie_options` | `false` | Removed in v7 |
| `_dd.configuration.start_session_replay_recording_manually` | `true` | Session Replay |
| `_dd.sdk_name` | `"rum"` | Intentionally skipped |
| `_dd.replay_stats` | `undefined` | Session Replay |
| `session.has_replay` | `undefined` | Session Replay |
| `session.sampled_for_replay` | `false` | Session Replay |
| `privacy.replay_level` | `"mask"` | Session Replay |
| `view.first_input_delay` | `undefined` | FID — deprecated metric |
| `view.first_input_time` | `undefined` | FID — deprecated metric |
| `view.first_input_target_selector` | `undefined` | FID — deprecated metric |
| `view.performance.fcp` | `undefined` | Omitted on route_change views (no FCP) |
| `view.performance.fid` | `undefined` | FID — deprecated metric |
| `view.performance.inp` | `undefined` | Omitted on route_change views (no interactions) |
| `view.performance.lcp` | `undefined` | Omitted on route_change views (no LCP) |
| `display.scroll.max_depth` | `810` | v8 has scroll tracking, but not emitting on this view |
| `display.scroll.max_depth_scroll_top` | `0` | Same |
| `display.scroll.max_scroll_height` | `810` | Same |
| `display.scroll.max_scroll_height_time` | `1002600000` | Same |

### Only in v8: none

### Value differences (expected)

| Field | v6 | v8 | Notes |
|---|---|---|---|
| `_dd.page_states[0].start` | `-12267400000` | `0` | v6 uses relative-to-view start, v8 uses 0-based |
| `view.referrer` | `"http://localhost:8443/"` | `""` | v8 sends empty referrer on route_change views |
| `view.cumulative_layout_shift` | `0.0023` | `0.0023384...` | v6 rounds to 4 decimal places, v8 doesn't |

---

## Resource Events

### Matching fields (31 of 51)

Both SDKs produce identical structure for:

```
_dd.browser_sdk_version    _dd.configuration.session_sample_rate
_dd.configuration.trace_sample_rate    _dd.drift    _dd.format_version
application.id    connectivity.effective_type    connectivity.status
date    ddtags    display.viewport.height    display.viewport.width
resource.decoded_body_size    resource.delivery_type    resource.duration
resource.encoded_body_size    resource.first_byte.duration
resource.first_byte.start    resource.id    resource.method
resource.protocol    resource.render_blocking_status    resource.size
resource.status_code    resource.transfer_size    resource.type
resource.url    service    session.id    session.type    source
tab.id    type    usr.anonymous_id    version    view.id    view.referrer
view.url
```

### Only in v6 (11 fields)

| Field | Value | Category |
|---|---|---|
| `_dd.configuration.session_replay_sample_rate` | `0` | Session Replay |
| `_dd.configuration.profiling_sample_rate` | `0` | Internal config |
| `_dd.configuration.beta_encode_cookie_options` | `false` | Removed in v7 |
| `_dd.sdk_name` | `"rum"` | Intentionally skipped |
| `_dd.discarded` | `false` | Internal sampling flag |
| `session.has_replay` | `undefined` | Session Replay |
| `session.sampled_for_replay` | `undefined` | Session Replay |
| `session.is_active` | `undefined` | Session Replay (only set on views) |
| `resource.graphql` | `undefined` | GraphQL tracking not implemented |
| `resource.download.duration` | `900000` | v6 uses nested sub-object for download |
| `resource.download.start` | `1800000` | v6 uses nested sub-object for download |

### Only in v8 (5 fields)

| Field | Notes |
|---|---|
| `resource.redirect` | v8 exposes redirect timing phase |
| `resource.dns` | v8 exposes DNS timing phase |
| `resource.connect` | v8 exposes connect timing phase |
| `resource.ssl` | v8 exposes SSL timing phase |
| `resource.download` | v8 uses flat field (vs v6's nested `download.duration/start`) |

---

## Remaining Differences by Category

### Session Replay (out of scope — 10 fields)

These will be implemented when Session Replay is built as a separate module:

- `session.has_replay` — whether session is being recorded
- `session.sampled_for_replay` — replay sampling decision
- `_dd.replay_stats` — replay recording statistics
- `_dd.configuration.session_replay_sample_rate` — replay sample rate config
- `_dd.configuration.start_session_replay_recording_manually` — manual recording config
- `privacy.replay_level` — privacy masking level

### Deprecated metrics (3 fields)

FID (First Input Delay) was deprecated by Chrome in favor of INP:

- `view.first_input_delay`
- `view.first_input_time`
- `view.first_input_target_selector`

### Internal config (3 fields)

Configuration values reported in `_dd.configuration`:

- `_dd.configuration.profiling_sample_rate` — profiling not in v8
- `_dd.configuration.beta_encode_cookie_options` — removed in v7
- `_dd.sdk_name` — intentionally skipped

### Not implemented (3 fields)

- `error.component_stack` — handled by framework packages (rum-react, rum-vue)
- `error.csp` — CSP violation details
- `resource.graphql` — GraphQL request tracking

### Internal flags (1 field)

- `_dd.discarded` — internal sampling discard flag

### Minor behavioral differences (3 items)

- **CLS rounding**: v6 rounds to 4 decimal places, v8 sends full precision
- **Page state start**: v6 uses relative-to-navigation start time, v8 uses 0
- **Referrer on route_change**: v6 includes previous URL, v8 sends empty string

---

## Test Configuration

```typescript
// v6
datadogRum.init({
  clientToken: 'pub_playground_v6',
  applicationId: 'playground-app-v6',
  site: 'datadoghq.com',
  service: 'playground',
  version: '0.1.0',
  proxy: (options) => `/intake/v6${options.path}?${options.parameters}`,
})

// v8
createSdk({
  clientToken: 'pub_playground_v8',
  site: 'datadoghq.com',
  service: 'playground',
  version: '0.1.0',
  sessionCookieName: '_dd_s_v8',
  proxy: (options) => `/intake/v8${options.path}?${options.parameters}`,
  modules: [logsProcessor, rumProcessor],
  rum: { applicationId: 'playground-app-v8' },
})
```

## Test Procedure

1. Both SDKs initialized on page load
2. `DD_RUM.addError(new Error('report test'), { report: true })` + `sdkV8.rum.addError(...)` triggered simultaneously
3. `DD_RUM.startView({ name: 'report-view' })` + `sdkV8.rum.startView('report-view')` triggered simultaneously
4. Events captured via `__ddBrowserSdkExtensionCallback` within 3 seconds
5. Deep field-by-field comparison using recursive key flattening
