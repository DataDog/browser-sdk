# Action Tracking Design

## Scope

Full action tracking: auto click actions with page activity detection, click chains, frustration detection (rage, dead, error clicks), manual actions (addAction, startAction/stopAction), DOM-based action naming, and event counts per action and per view.

## New pipeline events

```
action:click                    → user clicked (from click collector)
action:add_action               → manual instant action (from public API)
action:start_action             → manual long-running action start (from public API)
action:stop_action              → manual long-running action stop (from public API)
signal:network_request_start    → fetch/XHR request began (coordination)
resource:dom_mutation           → DOM changed (data)
observation:action              → final action event (from processor)
```

## New collectors

### Click collector (RUM-owned)

Starts inside RUM's module init. Listens to `pointerdown` and `pointerup` DOM events.

On `pointerdown`:
- Inspect the DOM to extract action name using the hierarchical naming strategy (data-dd-action-name, aria labels, text content, etc.)
- Extract target selector and dimensions
- Store reference for the corresponding pointerup

On `pointerup`:
- Compute position (clientX/clientY relative to element)
- Compute pointerUpDelay (pointerup time - pointerdown time)
- Publish `action:click` with all data

```typescript
// action:click payload
{
  name: string,
  nameSource: string,         // 'custom_attribute' | 'text_content' | 'standard_attribute' | ...
  targetSelector: string,
  composedPathSelector?: string,
  targetWidth: number,
  targetHeight: number,
  positionX: number,
  positionY: number,
  pointerUpDelay: number,
  startTime: number,
  startDate: number,
}
```

The action naming logic is a pure function in a separate file. The collector calls it at pointerdown time, before the DOM might change.

### DOM mutation collector (RUM-owned)

Starts inside RUM's module init. Creates a `MutationObserver` and publishes `resource:dom_mutation` for each batch of mutations. Starts in RUM for now, open to extraction to core if Session Replay needs it later.

### Network request start signal (core collector update)

The existing fetch and XHR collectors in `browser-sdk` publish `signal:network_request_start` when a request begins, before the async response. One extra `pipeline.publish()` call per collector.

## Action processor

Lives inside `browser-rum-next`. Manages the full action lifecycle.

### Click action flow

1. `action:click` arrives → processor creates a pending click, starts page activity tracking
2. Activity detector tracks `signal:network_request_start`, `resource:network_request`, and `resource:dom_mutation` to detect when side effects settle
3. More `action:click` events may arrive → click chain logic groups them
4. When chain finalizes (1s timeout with no new similar clicks):
   - Compute frustration
   - Publish `observation:action` for the chain (rage) or individual actions

### Manual action flow

1. `action:add_action` → immediately publish `observation:action` with name and context
2. `action:start_action` → create tracked action, start timing
3. `action:stop_action` → finalize tracked action, compute duration, publish `observation:action`

### Event counts

The processor subscribes to `observation:error`, `observation:resource`, and `observation:long_task`. During an active action's lifetime, it counts these events. Counts are attached to the action when it finalizes.

## Page activity detector

A reusable utility inside `browser-rum-next` that the action processor creates per click action.

Subscribes to:
- `signal:network_request_start` → increment pending request count
- `resource:network_request` → decrement pending request count
- `resource:dom_mutation` → mark activity detected

Phases:
1. **Validation** (100ms): if no activity detected, report `{ hadActivity: false }` (potential dead click)
2. **Completion**: once activity detected, wait for pending requests to hit zero AND no DOM mutations for 100ms. Report `{ hadActivity: true, endTime }`
3. **Max duration** (10s): forces completion if activity doesn't settle

## Click chain

The processor maintains a list of pending clicks. A new `action:click` belongs to the current chain if:
- Same target selector as previous click
- < 1 second since last click
- < 100px Euclidean distance from last click position

If it doesn't match, the current chain finalizes and a new one starts. A 1-second timer after the last click forces finalization.

## Frustration detection

Called on the finalized chain:

**Rage click**: >= 3 clicks in the chain AND no text selection or scroll during the chain. All clicks become a single rage action. Rage detection disables dead-click detection for the chain.

**Dead click**: click had no page activity (`hadActivity === false`) AND target is not an interactive element (input, textarea, select, label, contenteditable, canvas, anchor).

**Error click**: errors occurred during the action's duration (`errorCount > 0`).

Output:
- Rage chain → one `observation:action` with `frustration: ['rage_click']` (and optionally `'error_click'`)
- Non-rage chain → one `observation:action` per click, each with its own frustration array

## Observation:action event shape

```typescript
{
  type: 'action',
  date: number,
  action: {
    id: string,
    type: 'click' | 'custom',
    target: {
      name: string,
    },
    loading_time?: number,
    error: { count: number },
    long_task: { count: number },
    resource: { count: number },
    frustration?: {
      type: ('rage_click' | 'dead_click' | 'error_click')[],
    },
  },
  _dd?: {
    action?: {
      target?: {
        selector?: string,
        composed_path_selector?: string,
        width?: number,
        height?: number,
      },
      name_source?: string,
      position?: { x: number, y: number },
      pointer_up_delay?: number,
    },
  },
}
```

Manual actions use `type: 'custom'` and carry user-provided `context` at the top level. No `_dd` metadata.

## View event count integration

The view processor subscribes to `observation:action`, `observation:error`, `observation:resource`, and `observation:long_task`. It increments counters on `currentView` and publishes an updated `observation:view`.

```typescript
currentView.eventCounts = {
  actionCount: number,
  errorCount: number,
  resourceCount: number,
  longTaskCount: number,
  frustrationCount: number,
}
```

## Public API additions

The RUM bridge adds:
- `addAction(name, context?)` → publishes `action:add_action`
- `startAction(name, options?)` → publishes `action:start_action`
- `stopAction(name?, options?)` → publishes `action:stop_action`

## Action naming strategy

Pure function called by the click collector at pointerdown time. Hierarchical with fallbacks:

1. `data-dd-action-name` attribute (or custom via config). Walks up DOM with no limit.
2. If privacy masking enabled: return "Masked Element"
3. Priority strategies (up to 10 parents from target):
   - input with labels → label text
   - input type button/submit/reset → input value
   - button, label, role="button" → textual content
   - aria-label
   - aria-labelledby → join referenced element text
   - alt, name, title, placeholder attributes
   - select → first option text
4. Fallback: element textual content (innerText/textContent)
5. Final fallback: empty string

Processing: normalize whitespace, truncate to 100 chars with `[...]` suffix.

## Out of scope

- Shadow DOM support (`betaTrackActionsInShadowDom`) — can be added later
- Privacy masking for action names — can be added later
- Excluded activity URLs — can be added later
- Custom `actionNameAttribute` config — can be added later
