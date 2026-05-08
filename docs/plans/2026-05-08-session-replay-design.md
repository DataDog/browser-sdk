# Session Replay Module Design

Session Replay for v8 as a `Module` that plugs into `createSdk()`. Records DOM snapshots and mutations, batches them into segments, and publishes segments as `observation:replay` events through the pipeline.

## Module structure

```
packages/browser-replay-next/
├── src/
│   ├── extension.ts              — config extension for the `replay` key
│   ├── processor/
│   │   └── index.ts              — Module entry: init(), pipeline wiring, public API
│   ├── domain/
│   │   ├── recorder.ts           — orchestrates trackers + serialization
│   │   ├── segmentCollection.ts  — batches records → segments → pipeline
│   │   └── record/               — ported v6 serialization + trackers
│   └── enrichers/
│       └── replayContextEnricher.ts — replay-specific metadata on segments
```

## Pipeline integration

The module subscribes to two signals and publishes one observation type:

- `signal:view_changed` → tracker tracks current view ID, segment flushes on view change
- `signal:session_expired` → flush final segment, stop recording
- `observation:replay` → enriched by the standard chain (session, view, metadata, tags), routed to the `replay` track

Records (mutations, mouse moves, snapshots) stay internal to the module. Only flushed segments leave as pipeline events.

```
signal:view_changed  ──→  [replay module]  ──→  observation:replay
signal:session_expired ──→  [replay module]        ↓
                                              route('observation:replay', 'replay')
```

## Configuration

The replay module has its own config extension with its own sample rate:

```typescript
interface ReplayInitConfig {
  sampleRate?: number                                        // 0-100, default 0
  startRecordingManually?: boolean                           // default false
  defaultPrivacyLevel?: 'mask' | 'mask-user-input' | 'allow' // default 'mask'
}
```

```typescript
DD.init({
  clientToken: '...',
  rum: { applicationId: '...' },
  replay: {
    sampleRate: 80,
    defaultPrivacyLevel: 'mask',
  },
})
```

The module reads `context.config.replay`, makes its own sampling decision, and manages its own recording lifecycle. The session is shared (`context.session`) but sampling is the module's concern.

## Public API

```typescript
interface ReplayPublicApi {
  startSessionReplayRecording(options?: { force?: boolean }): void
  stopSessionReplayRecording(): void
}
```

Exposed as `sdk.replay.startSessionReplayRecording()`.

When `startRecordingManually: true`, the module initializes but doesn't record. Recording starts on `startSessionReplayRecording()`. The `force` option bypasses sampling.

## Recording subsystem

Three layers, all internal to the module. Ported from v6 with integration points adapted.

### Trackers

Observe DOM events and emit records via callback:

- `trackMutation` — MutationObserver, 100ms batch debounce
- `trackInput` — input/change events
- `trackScroll` — scroll position
- `trackMouseInteraction` — click, focus, blur
- `trackMove` — mouse movement (throttled)
- `trackViewportResize` — window resize
- `trackMediaInteraction` — audio/video play/pause
- `trackStyleSheet` — stylesheet mutations
- `trackFocus` — document focus/blur
- `trackVisualViewportResize` — visual viewport (pinch zoom)

### Serialization

Converts DOM nodes to the virtual tree format:

- `serializeNode` / `serializeNodeAsChange` — node → serialized format
- `serializeFullSnapshot` / `serializeFullSnapshotAsChange` — full DOM capture
- `serializeMutations` / `serializeMutationsAsChange` — incremental changes
- `changeEncoder` + `stringTable` — compact wire format with string dedup
- `vNode` / `vDocument` — virtual DOM tree (in-memory mirror)

### Privacy

Ported as-is from v6:

- `NodePrivacyLevel` (ALLOW, MASK, MASK_USER_INPUT, HIDDEN, IGNORE)
- Per-element `dd-privacy` attribute overrides
- Privacy level inheritance through DOM tree

## Segment collection and transport

### Flush triggers

- View change (`signal:view_changed`)
- Size limit (60 KB compressed)
- Duration limit (5 seconds)
- Session expiry (`signal:session_expired`)
- Page exit (visibility hidden / beforeunload)
- Recording stopped by user

### Flush flow

```
records accumulate
        ↓
    flush trigger
        ↓
    compress (CompressionStream via createDeflateEncoder)
        ↓
    build segment { records, metadata }
        ↓
    pipeline.publish('observation:replay', segment)
        ↓
    enricher chain adds session.id, view.id, tags
        ↓
    TransportRouter serializes + sends via replay track
```

Compression uses the existing `createDeflateEncoder` (CompressionStream API with identity fallback). No Web Worker needed.

### Deferred: page exit transport

On page exit, the TransportRouter flushes via `transport.send()`. v6 uses `sendOnExit()` (Beacon API) for exit flushes. Whether the current router handles this correctly is deferred to implementation.

## What gets ported vs what's new

### Ported from v6 (~6K lines)

- `serialization/` — full snapshot, incremental mutations, node serialization, change encoder, string table, virtual DOM tree
- `trackers/` — all 11 DOM event observers
- `record.ts` — orchestrator (adapted for module context)
- `itemIds.ts` — ID allocation
- `shadowRootsController.ts` — shadow DOM tracking
- Privacy masking logic

### New for v8 (~500 lines)

- `replayExtension` — config validation for the `replay` key
- `replayProcessor` — Module entry point, pipeline wiring, public API
- `segmentCollection.ts` — publishes `observation:replay` to pipeline
- Transport routing via `context.transport.route('observation:replay', 'replay')`

### Dropped from v6 (~800 lines)

- DeflateEncoder Web Worker — replaced by CompressionStream
- `recorderApi.ts` pre-start/post-start strategy — v8 modules init after session exists
- `lazyLoadRecorder()` — v8 handles module loading via `resolveModule`
