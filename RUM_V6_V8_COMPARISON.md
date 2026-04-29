# Detailed Field-by-Field Comparison: RUM v6 vs v8 Event Payloads

This document provides a comprehensive comparison of every field sent by v6 and v8 RUM SDKs for each event type. The comparison is based on the **serialized payloads** that reach the Datadog intake (not intermediate representations).

---

## KEY OBSERVATIONS

### Format Change: v6 uses snake_case, v8 also uses snake_case
Both v6 and v8 serialize events to snake_case for the intake.

### Architecture Difference
- **v6**: Collections create `RawRumEvent` objects → Assembly merges common fields (via hooks) → final event sent
- **v8**: Processors create `Observation` objects → Enrichers add fields progressively → final event sent

### Common Fields Added by All Events (v6)
1. `session` (with id, type, has_replay, sampled_for_replay, is_active for views)
2. `view` (with id, name)
3. `service`, `version`, `context` (from hooks)
4. `ddtags` (from tags)
5. `application.id` (from contexts)
6. `_dd.format_version` = 2 (v8 only)
7. `_dd.browser_sdk_version`
8. `_dd.drift`
9. `_dd.configuration` (session_sample_rate, session_replay_sample_rate, trace_sample_rate)
10. `source` = 'browser'
11. `date` (timestamp)
12. Global/user/account context fields

---

## VIEW EVENT COMPARISON

### v6 View Event (Final Serialized Payload)

```
type: 'view'
date: <timestamp>
view: {
  id: <uuid>
  name: <string> (optional)
  url: <string>
  referrer: <string>
  loading_type: 'initial_load' | 'route_change' | 'bf_cache'
  is_active: <boolean>
  time_spent: <duration_ms>
  
  // Metrics
  first_byte?: <duration_ms>
  first_contentful_paint?: <duration_ms>
  first_input_delay?: <duration_ms>
  first_input_time?: <duration_ms>
  first_input_target_selector?: <string>
  interaction_to_next_paint?: <duration_ms>
  interaction_to_next_paint_time?: <duration_ms>
  interaction_to_next_paint_target_selector?: <string>
  cumulative_layout_shift?: <number> (score, 0-1)
  cumulative_layout_shift_time?: <duration_ms>
  cumulative_layout_shift_target_selector?: <string>
  largest_contentful_paint?: <duration_ms>
  largest_contentful_paint_target_selector?: <string>
  dom_interactive?: <duration_ms>
  dom_content_loaded?: <duration_ms>
  dom_complete?: <duration_ms>
  load_event?: <duration_ms>
  loading_time?: <duration_ms>
  
  // Performance details
  performance?: {
    cls?: {
      score: <number>
      timestamp?: <duration_ms>
      target_selector?: <string>
      previous_rect?: {x, y, width, height}
      current_rect?: {x, y, width, height}
    }
    fcp?: {
      timestamp: <number>
    }
    fid?: {
      duration: <duration_ms>
      timestamp: <duration_ms>
      target_selector?: <string>
    }
    inp?: {
      duration: <duration_ms>
      timestamp?: <duration_ms>
      target_selector?: <string>
      sub_parts?: {
        input_delay: <duration_ms>
        processing_duration: <duration_ms>
        presentation_delay: <duration_ms>
      }
    }
    lcp?: {
      timestamp: <duration_ms>
      target_selector?: <string>
      resource_url?: <string>
      sub_parts?: {
        load_delay: <duration_ms>
        load_time: <duration_ms>
        render_delay: <duration_ms>
      }
    }
  }
  
  // Event counts
  error: { count: <number> }
  action: { count: <number> }
  long_task: { count: <number> }
  resource: { count: <number> }
  frustration: { count: <number> }
  
  // Custom timings
  custom_timings?: { [key]: <duration_ms> }
}

display?: {
  scroll?: {
    max_depth?: <number>
    max_depth_scroll_top?: <number>
    max_scroll_height?: <number>
    max_scroll_height_time?: <duration_ms>
  }
}

privacy?: {
  replay_level: <DefaultPrivacyLevel>
}

device?: {
  locale?: <string>
  locales?: <string[]>
  time_zone?: <string>
}

_dd: {
  document_version: <number>
  replay_stats?: {
    records_count: <number>
    segments_count: <number>
    segments_total_raw_size: <number>
  }
  page_states?: [
    {
      state: <PageState>
      start: <duration_ms>
    }
  ]
  cls?: {
    device_pixel_ratio: <number>
  }
  configuration?: {
    start_session_replay_recording_manually: <boolean>
  }
}

// Common fields added by assembly:
session: {
  id: <string>
  type: 'user'
  has_replay?: <boolean>
  sampled_for_replay?: <boolean>
  is_active?: <boolean>
}
view: { id: <uuid>, name?: <string> }  // ALSO MERGED from hooks
service?: <string>
version?: <string>
context?: <object>
ddtags?: <string>
```

### v8 View Event (Final Serialized Payload)

```
type: 'view'
date: <timestamp>
view: {
  id: <uuid>
  name?: <string>
  url: <string>
  referrer?: <string>
  loading_type: 'initial_load' | 'route_change' | 'bf_cache'
  duration: <duration_ms>
  is_active: <boolean>
  
  // Metrics (same structure as v6)
  first_contentful_paint?: <duration_ms>
  largest_contentful_paint?: <duration_ms>
  cumulative_layout_shift?: <number>
  interaction_to_next_paint?: <duration_ms>
  
  // Event counts
  error: { count: <number> }
  action: { count: <number> }
  long_task: { count: <number> }
  resource: { count: <number> }
  frustration: { count: <number> }
}

// Enriched by displayEnricher
display?: {
  viewport?: {
    width: <number>
    height: <number>
  }
}

_dd: {
  format_version: 2
  browser_sdk_version?: <string>
  drift: <number>
  configuration?: {
    session_sample_rate?: <number>
    session_replay_sample_rate?: <number>
    trace_sample_rate?: <number>
  }
}

// Common enriched fields:
session: { id: <string> }
view: { id: <string> }
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
application?: { id: <string> }

// Contextual fields:
usr?: <object>
context?: <object>
account?: <object>
```

### View Event Gap Analysis

| Field | v6 | v8 | Notes |
|-------|----|----|-------|
| `view.id` | ✓ | ✓ | Both present |
| `view.url` | ✓ | ✓ | Both present |
| `view.referrer` | ✓ | ✓ | Both present, but v8 optional |
| `view.loading_type` | ✓ | ✓ | Both present |
| `view.is_active` | ✓ | ✓ | Both present |
| `view.time_spent` | ✓ | Δ | v6 has `time_spent`, v8 uses `duration` |
| `view.name` | ✓ | ✓ | Both present but optional |
| `view.first_byte` | ✓ | ✗ | v6 only |
| `view.first_contentful_paint` | ✓ | ✓ | Both present |
| `view.first_input_delay` | ✓ | ✗ | v6 only (replaced by INP) |
| `view.first_input_time` | ✓ | ✗ | v6 only (replaced by INP) |
| `view.first_input_target_selector` | ✓ | ✗ | v6 only |
| `view.interaction_to_next_paint` | ✓ | ✓ | Both present |
| `view.interaction_to_next_paint_time` | ✓ | ✗ | v6 only, v8 in performance |
| `view.interaction_to_next_paint_target_selector` | ✓ | ✗ | v6 only |
| `view.cumulative_layout_shift` | ✓ | ✓ | Both present, v6 is score, v8 is score |
| `view.cumulative_layout_shift_time` | ✓ | ✗ | v6 only |
| `view.cumulative_layout_shift_target_selector` | ✓ | ✗ | v6 only |
| `view.largest_contentful_paint` | ✓ | ✓ | Both present |
| `view.largest_contentful_paint_target_selector` | ✓ | ✗ | v6 only |
| `view.dom_interactive` | ✓ | ✗ | v6 only |
| `view.dom_content_loaded` | ✓ | ✗ | v6 only |
| `view.dom_complete` | ✓ | ✗ | v6 only |
| `view.load_event` | ✓ | ✗ | v6 only |
| `view.loading_time` | ✓ | ✗ | v6 only |
| `view.performance` | ✓ | ✗ | v6 only (detailed metrics) |
| `view.error.count` | ✓ | ✓ | Both present |
| `view.action.count` | ✓ | ✓ | Both present |
| `view.long_task.count` | ✓ | ✓ | Both present |
| `view.resource.count` | ✓ | ✓ | Both present |
| `view.frustration.count` | ✓ | ✓ | Both present |
| `view.custom_timings` | ✓ | ✗ | v6 only |
| `display.scroll` | ✓ | ✗ | v6 only |
| `display.viewport` | ✗ | ✓ | v8 only |
| `privacy.replay_level` | ✓ | ✗ | v6 only |
| `device.locale` | ✓ | ✗ | v6 only |
| `device.locales` | ✓ | ✗ | v6 only |
| `device.time_zone` | ✓ | ✗ | v6 only |
| `_dd.document_version` | ✓ | ✗ | v6 only |
| `_dd.format_version` | ✗ | ✓ | v8 only (always 2) |
| `_dd.replay_stats` | ✓ | ✗ | v6 only |
| `_dd.page_states` | ✓ | ✗ | v6 only |
| `_dd.cls.device_pixel_ratio` | ✓ | ✗ | v6 only |
| `_dd.configuration.start_session_replay_recording_manually` | ✓ | ✗ | v6 only |
| `session.type` | ✓ | ✗ | v6 only (always 'user') |
| `session.has_replay` | ✓ | ✗ | v6 only |
| `session.sampled_for_replay` | ✓ | ✗ | v6 only |
| `session.is_active` | ✓ | ✗ | v6 only |

**CRITICAL GAPS:**
- v8 is missing: `first_byte`, `first_input_*`, `cumulative_layout_shift_*` (target/time), `dom_*`, `load_event`, `loading_time`, `custom_timings`, `device.*`, `replay_level`, `document_version`, `replay_stats`
- v8 adds: `display.viewport`, `_dd.format_version`, simplified fields

---

## RESOURCE EVENT COMPARISON

### v6 Resource Event

```
type: 'resource'
date: <timestamp>
resource: {
  id: <string>
  type: <ResourceType> (e.g., 'xhr', 'fetch', 'image', 'css', 'js', 'media', 'other')
  url: <string>
  method?: <string> (HTTP method)
  status_code?: <number>
  duration?: <duration_ms>
  size?: <bytes>
  encoded_body_size?: <bytes>
  decoded_body_size?: <bytes>
  transfer_size?: <bytes>
  render_blocking_status?: <string> (e.g., 'blocking', 'non-blocking')
  protocol?: <string> (e.g., 'http/1.1', 'h2', 'h3')
  delivery_type?: <DeliveryType> ('cache' | 'navigational-prefetch' | 'other')
  
  // Timings
  redirect?: { duration: <duration_ms>, start: <duration_ms> }
  dns?: { duration: <duration_ms>, start: <duration_ms> }
  connect?: { duration: <duration_ms>, start: <duration_ms> }
  ssl?: { duration: <duration_ms>, start: <duration_ms> }
  worker?: { duration: <duration_ms>, start: <duration_ms> }
  first_byte?: { duration: <duration_ms>, start: <duration_ms> }
  download?: { duration: <duration_ms>, start: <duration_ms> }
  
  // Optional details
  graphql?: {
    operation_name?: <string>
    operation_type?: <string>
    variables?: <string>
  }
  request?: {
    headers?: { [key]: <string> }
  }
  response?: {
    headers?: { [key]: <string> }
  }
}

_dd: {
  trace_id?: <string>
  span_id?: <string>
  rule_psr?: <number>
  page_states?: [...]
}

// Common fields:
session: { id, type, has_replay, ... }
view: { id }
service?: <string>
version?: <string>
ddtags?: <string>
```

### v8 Resource Event

```
type: 'resource'
date: <timestamp>
resource: {
  url: <string>
  type: <string> (e.g., 'xhr', 'fetch', 'image', 'css', 'js', 'media', 'other')
  duration?: <duration_ms>
  status_code?: <number>
  method?: <string>
  size?: <bytes>
  encoded_body_size?: <bytes>
  decoded_body_size?: <bytes>
  transfer_size?: <bytes>
  protocol?: <string>
  delivery_type?: <string>
  render_blocking_status?: <string>
  
  // Timings (same structure as v6)
  redirect?: { duration: <duration_ms>, start: <duration_ms> }
  dns?: { duration: <duration_ms>, start: <duration_ms> }
  connect?: { duration: <duration_ms>, start: <duration_ms> }
  ssl?: { duration: <duration_ms>, start: <duration_ms> }
  first_byte?: { duration: <duration_ms>, start: <duration_ms> }
  download?: { duration: <duration_ms>, start: <duration_ms> }
  
  // Optional details
  graphql?: {
    operation_name?: <string>
    operation_type?: <string>
  }
}

_dd: {
  format_version: 2
  browser_sdk_version?: <string>
  drift: <number>
  trace_id?: <string>
  span_id?: <string>
  rule_psr?: <number>
}

// Common fields:
session: { id }
view: { id }
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
```

### Resource Event Gap Analysis

| Field | v6 | v8 | Notes |
|-------|----|----|-------|
| `resource.id` | ✓ | ✗ | v6 only (UUID) |
| `resource.url` | ✓ | ✓ | Both present |
| `resource.type` | ✓ | ✓ | Both present |
| `resource.method` | ✓ | ✓ | Both present |
| `resource.status_code` | ✓ | ✓ | Both present |
| `resource.duration` | ✓ | ✓ | Both present |
| `resource.size` | ✓ | ✓ | Both present |
| `resource.encoded_body_size` | ✓ | ✓ | Both present |
| `resource.decoded_body_size` | ✓ | ✓ | Both present |
| `resource.transfer_size` | ✓ | ✓ | Both present |
| `resource.protocol` | ✓ | ✓ | Both present |
| `resource.delivery_type` | ✓ | ✓ | Both present |
| `resource.render_blocking_status` | ✓ | ✓ | Both present |
| `resource.redirect` | ✓ | ✓ | Both present |
| `resource.dns` | ✓ | ✓ | Both present |
| `resource.connect` | ✓ | ✓ | Both present |
| `resource.ssl` | ✓ | ✓ | Both present |
| `resource.first_byte` | ✓ | ✓ | Both present |
| `resource.download` | ✓ | ✓ | Both present |
| `resource.worker` | ✓ | ✗ | v6 only (Web Worker) |
| `resource.graphql` | ✓ | ✓ | Both present, but v8 missing `variables` |
| `resource.request.headers` | ✓ | ✗ | v6 only |
| `resource.response.headers` | ✓ | ✗ | v6 only |
| `_dd.page_states` | ✓ | ✗ | v6 only |

**CRITICAL GAPS:**
- v8 is missing: `resource.id`, `resource.worker`, request/response headers, `graphql.variables`

---

## ACTION EVENT COMPARISON

### v6 Action Event

```
type: 'action'
date: <timestamp>
action: {
  id: <uuid>
  type: <ActionType> ('click' | 'custom' | 'tap' | 'scroll' | 'swipe' | 'application_start' | 'back')
  target: {
    name: <string>
  }
  loading_time?: <duration_ms>
  error?: { count: <number> }
  long_task?: { count: <number> }
  resource?: { count: <number> }
  frustration?: {
    type: <FrustrationType[]> ('rage_click' | 'error_click' | 'dead_click')
  }
}

view?: {
  in_foreground: <boolean>
}

_dd?: {
  action?: {
    target?: {
      selector?: <string> (CSS selector)
      width?: <number>
      height?: <number>
      composed_path_selector?: <string> (full path)
    }
    name_source?: <string> ('event_target' | 'body_click_listener' | etc.)
    position?: {
      x: <number>
      y: <number>
    }
    pointer_up_delay?: <duration_ms>
  }
}

context?: <object> (for manual actions)

// Common fields:
session: { id, type, has_replay, ... }
view: { id }
service?: <string>
version?: <string>
ddtags?: <string>
```

### v8 Action Event

```
type: 'action'
date: <timestamp>
action: {
  id: <uuid>
  type: <ActionType> ('click' | 'custom')
  target: {
    name: <string>
  }
  loading_time?: <duration_ms>
  error: { count: <number> }
  long_task: { count: <number> }
  resource: { count: <number> }
  frustration?: {
    type: <FrustrationType[]>
  }
}

_dd: {
  format_version: 2
  browser_sdk_version?: <string>
  drift: <number>
  action?: {
    target?: {
      selector?: <string>
      width?: <number>
      height?: <number>
    }
    name_source?: <string>
    position?: { x: <number>, y: <number> }
    pointer_up_delay?: <duration_ms>
  }
}

context?: <object> (for manual actions)

// Common fields:
session: { id }
view: { id }
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
```

### Action Event Gap Analysis

| Field | v6 | v8 | Notes |
|-------|----|----|-------|
| `action.id` | ✓ | ✓ | Both present |
| `action.type` | ✓ | Δ | v6 has 7 types, v8 has 2 (click, custom) |
| `action.target.name` | ✓ | ✓ | Both present |
| `action.loading_time` | ✓ | ✓ | Both present |
| `action.error.count` | ✓ | ✓ | Both present |
| `action.long_task.count` | ✓ | ✓ | Both present |
| `action.resource.count` | ✓ | ✓ | Both present |
| `action.frustration.type` | ✓ | ✓ | Both present |
| `view.in_foreground` | ✓ | ✗ | v6 only |
| `_dd.action.target.composed_path_selector` | ✓ | ✗ | v6 only |
| `_dd.action.target.selector` | ✓ | ✓ | Both present |
| `_dd.action.target.width` | ✓ | ✓ | Both present |
| `_dd.action.target.height` | ✓ | ✓ | Both present |
| `_dd.action.name_source` | ✓ | ✓ | Both present |
| `_dd.action.position` | ✓ | ✓ | Both present |
| `_dd.action.pointer_up_delay` | ✓ | ✓ | Both present |

**CRITICAL GAPS:**
- v8 is missing: action types (tap, scroll, swipe, application_start, back), `view.in_foreground`, `composed_path_selector`
- v8 moves `_dd` fields to top-level enricher (loses details for custom actions)

---

## ERROR EVENT COMPARISON

### v6 Error Event

```
type: 'error'
date: <timestamp>
error: {
  id: <uuid>
  type?: <string> (e.g., 'ReferenceError', 'TypeError', etc.)
  message: <string>
  stack?: <string> (JavaScript stack trace)
  handling_stack?: <string> (custom handling context)
  component_stack?: <string> (React component stack)
  source: <ErrorSource> ('console', 'logger', 'agent', 'custom', 'network', 'source')
  handling?: <ErrorHandling> ('handled' | 'unhandled')
  fingerprint?: <string> (error fingerprint)
  causes?: [
    {
      type?: <string>
      message?: <string>
      stack?: <string>
    }
  ]
  source_type: 'browser'
  csp?: {
    document_uri?: <string>
    violated_directive?: <string>
    effective_directive?: <string>
    original_policy?: <string>
    blocked_uri?: <string>
    status_code?: <number>
  }
}

view?: {
  in_foreground: <boolean>
}

// Common fields:
session: { id, type, has_replay, ... }
view: { id }
service?: <string>
version?: <string>
context?: <object>
ddtags?: <string>
```

### v8 Error Event

```
type: 'error'
date: <timestamp>
error: {
  message: <string>
  type?: <string>
  stack?: <string>
  source: <string>
  fingerprint?: <string>
  causes?: [
    {
      type?: <string>
      message?: <string>
      stack?: <string>
    }
  ]
}

_dd: {
  format_version: 2
  browser_sdk_version?: <string>
  drift: <number>
}

// Common fields:
session: { id }
view: { id }
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
```

### Error Event Gap Analysis

| Field | v6 | v8 | Notes |
|-------|----|----|-------|
| `error.id` | ✓ | ✗ | v6 only (UUID) |
| `error.message` | ✓ | ✓ | Both present |
| `error.type` | ✓ | ✓ | Both present |
| `error.stack` | ✓ | ✓ | Both present |
| `error.handling_stack` | ✓ | ✗ | v6 only |
| `error.component_stack` | ✓ | ✗ | v6 only (React) |
| `error.source` | ✓ | ✓ | Both present |
| `error.source_type` | ✓ | ✗ | v6 only (always 'browser') |
| `error.handling` | ✓ | ✗ | v6 only |
| `error.fingerprint` | ✓ | ✓ | Both present |
| `error.causes` | ✓ | ✓ | Both present |
| `error.csp` | ✓ | ✗ | v6 only |
| `view.in_foreground` | ✓ | ✗ | v6 only |

**CRITICAL GAPS:**
- v8 is missing: `error.id`, `error.handling_stack`, `error.component_stack`, `error.source_type`, `error.handling`, `error.csp`, `view.in_foreground`

---

## LONG_TASK EVENT COMPARISON

### v6 Long Task Event (Simple)

```
type: 'long_task'
date: <timestamp>
long_task: {
  id: <uuid>
  entry_type: 'long-task'
  duration: <duration_ms>
}

_dd: {
  discarded: <boolean>
}

// Common fields:
session: { id, type, has_replay, ... }
view: { id }
service?: <string>
version?: <string>
ddtags?: <string>
```

### v6 Long Animation Frame Event (LoAF)

```
type: 'long_task' // Ingested as Long Task
date: <timestamp>
long_task: {
  id: <uuid>
  entry_type: 'long-animation-frame'
  duration: <duration_ms>
  blocking_duration: <duration_ms>
  first_ui_event_timestamp: <duration_ms>
  render_start: <duration_ms>
  style_and_layout_start: <duration_ms>
  start_time: <duration_ms>
  scripts: [
    {
      duration: <duration_ms>
      pause_duration: <duration_ms>
      forced_style_and_layout_duration: <duration_ms>
      start_time: <duration_ms>
      execution_start: <duration_ms>
      source_url: <string> (script URL)
      source_function_name: <string>
      source_char_position: <number>
      invoker: <string>
      invoker_type: <InvokerType> ('user-callback' | 'event-listener' | 'resolve-promise' | 'reject-promise' | 'classic-script' | 'module-script')
      window_attribution: <string>
    }
  ]
}

_dd: {
  discarded: <boolean>
}

// Common fields:
session: { id, type, has_replay, ... }
view: { id }
service?: <string>
version?: <string>
ddtags?: <string>
```

### v8 Long Task Event

```
type: 'long_task'
date: <timestamp>
long_task: {
  duration: <duration_ms>
  blocking_duration?: <duration_ms>
  render_start?: <duration_ms>
  style_and_layout_start?: <duration_ms>
}

scripts?: [
  {
    source_url: <string>
    source_function_name: <string>
    invoker: <string>
    invoker_type: <string>
    duration: <duration_ms>
    execution_start: <duration_ms>
    pause_duration: <duration_ms>
    forced_style_and_layout_duration: <duration_ms>
    window_attribution: <string>
  }
]

_dd: {
  format_version: 2
  browser_sdk_version?: <string>
  drift: <number>
}

// Common fields:
session: { id }
view: { id }
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
```

### Long Task Event Gap Analysis

| Field | v6 | v8 | Notes |
|-------|----|----|-------|
| `long_task.id` | ✓ | ✗ | v6 only |
| `long_task.entry_type` | ✓ | ✗ | v6 only ('long-task' or 'long-animation-frame') |
| `long_task.duration` | ✓ | ✓ | Both present |
| `long_task.blocking_duration` | ✓ | ✓ | Both present (LoAF only in v6) |
| `long_task.render_start` | ✓ | ✓ | Both present (LoAF only in v6) |
| `long_task.style_and_layout_start` | ✓ | ✓ | Both present (LoAF only in v6) |
| `long_task.first_ui_event_timestamp` | ✓ | ✗ | v6 only |
| `long_task.start_time` | ✓ | ✗ | v6 only (LoAF) |
| `scripts` | ✓ | ✓ | Both present (LoAF only in v6, top-level in v8) |
| `_dd.discarded` | ✓ | ✗ | v6 only |

**CRITICAL GAPS:**
- v8 is missing: `long_task.id`, `long_task.entry_type`, `long_task.first_ui_event_timestamp`, `long_task.start_time`, `_dd.discarded`
- v8 doesn't distinguish between simple long tasks and LoAF in the payload structure

---

## VITAL EVENT (Not Covered in Detail)
- Both v6 and v8 have minimal implementation
- Format differs but same basic fields (`vital.id`, `vital.name`, `vital.type`)

---

## COMMON FIELDS ACROSS ALL EVENTS

### v6 (Added by Assembly Hooks)
```
session: {
  id: <string>
  type: 'user'
  has_replay?: <boolean> (views only)
  sampled_for_replay?: <boolean> (views only)
  is_active?: <boolean> (views only)
}
view: {
  id: <string>
  name?: <string>
}
service?: <string>
version?: <string>
context?: <object>
ddtags?: <string> (format: "sdk_version:x.y.z,env:prod,service:app,version:1.0.0")
```

### v8 (Added by Enrichers)
```
session: {
  id: <string>
}
view: {
  id: <string>
}
source: 'browser'
service?: <string>
version?: <string>
ddtags?: <string>
application?: {
  id: <string>
}
_dd: {
  format_version: 2 (always)
  browser_sdk_version?: <string>
  drift: <number> (time difference between device and server)
  configuration?: {
    session_sample_rate?: <number>
    session_replay_sample_rate?: <number>
    trace_sample_rate?: <number>
  }
}
usr?: <object> (user context)
account?: <object> (account context)
```

---

## SUMMARY OF CRITICAL MISSING FIELDS IN v8

### High Impact (Used by Backend/UX)
1. **View Events:**
   - `view.time_spent` (changed to `duration`)
   - `view.first_byte`, `view.dom_*`, `view.load_event`
   - `view.performance` (detailed metrics)
   - `device` info (locale, locales, time_zone)
   - `display.scroll` metrics
   - `_dd.document_version`, `_dd.replay_stats`
   - `session.has_replay`, `session.sampled_for_replay`, `session.is_active`

2. **Resource Events:**
   - `resource.id`
   - `resource.worker` (Web Worker detection)
   - Request/response headers

3. **Action Events:**
   - Multiple action types (tap, scroll, swipe, application_start, back)
   - `view.in_foreground`
   - `composed_path_selector`

4. **Error Events:**
   - `error.id`, `error.handling_stack`, `error.component_stack`
   - `error.handling`, `error.csp`
   - `view.in_foreground`

5. **Long Task Events:**
   - `long_task.id`, `long_task.entry_type`
   - `first_ui_event_timestamp`, `start_time` (LoAF)
   - No distinction between simple long task and LoAF

### Medium Impact
- `_dd` fields (page_states, configuration details moved to top-level)
- Session replay context (moved/missing)

### Low Impact
- Event count discrepancies
- Some optional timing fields

---

## KEY DIFFERENCES IN STRUCTURE

| Aspect | v6 | v8 |
|--------|----|----|
| **Session Fields** | Has replay status, type | Only has ID |
| **Performance Metrics** | Detailed with sub_parts, targets | Simplified, basic metrics |
| **Action Types** | 7 types | 2 types (click, custom) |
| **Field Names** | Some v6-specific naming | Aligned to newer specs |
| **Common Fields Location** | Merged at assembly | Added by enrichers |
| **_dd Structure** | Event-specific details | Standardized (format_version, sdk_version, drift, config) |
| **Device Info** | Explicit device object | Missing |
| **Timing Details** | Comprehensive | Basic durations only |

---

## RECOMMENDATIONS FOR MIGRATION

1. **Backend Impact:** v8 is missing fields that v6 sends. Ensure backend can handle missing fields gracefully.
2. **Analytics Impact:** Queries relying on `view.performance`, `device.*`, `session.has_replay` will fail.
3. **UI Impact:** Dashboards showing detailed metrics (`first_byte`, `dom_*`) will need adjustment.
4. **Data Integrity:** v8 doesn't send resource.id, long_task.id — potential issues with deduplication.
5. **Session Replay:** Missing `session.has_replay` and `session.sampled_for_replay` may affect replay detection.

