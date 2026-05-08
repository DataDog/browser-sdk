# Session Replay Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement Session Replay as a v8 module. Port DOM serialization and trackers from v6, build new segment collection that publishes `observation:replay` to the pipeline, and wire as a `Module` in `createSdk()`.

**Architecture:** New `browser-replay-next` package. Records stay internal to the module. Flushed segments are published as `observation:replay`, enriched by the standard chain, and routed to the `replay` track via `context.transport.route()`.

**Tech Stack:** TypeScript, MutationObserver, CompressionStream, Jasmine/Karma tests, tsdown builds.

**Design doc:** `docs/plans/2026-05-08-session-replay-design.md`

---

## Prerequisites

Run `yarn install` and `git submodule update --init` before starting.

All test commands use: `yarn test:unit --spec <path>`

Reference files for patterns:
- Module pattern: `packages/browser-rum-next/src/processor/index.ts`
- Extension pattern: `packages/browser-rum-next/src/domain/configuration.ts`
- Enricher pattern: `packages/core-next/src/domain/enricher/sessionEnricher.ts`
- Package scaffold: `packages/browser-rum-next/package.json`
- SDK wiring: `packages/browser-sdk/src/domain/sdk.ts`

v6 source (port from):
- Serialization: `packages/rum/src/domain/record/serialization/` (~5,530 lines)
- Trackers: `packages/rum/src/domain/record/trackers/` (~700 lines)
- Record orchestrator: `packages/rum/src/domain/record/record.ts` (~90 lines)
- Item IDs: `packages/rum/src/domain/record/itemIds.ts` (~100 lines)
- Shadow roots: `packages/rum/src/domain/record/shadowRootsController.ts` (~170 lines)
- Recording scope: `packages/rum/src/domain/record/recordingScope.ts` (~60 lines)
- Mutation batch: `packages/rum/src/domain/record/mutationBatch.ts` (~80 lines)
- Elements scroll: `packages/rum/src/domain/record/elementsScrollPositions.ts` (~60 lines)
- Full snapshots: `packages/rum/src/domain/record/startFullSnapshots.ts` (~150 lines)
- Segment collection: `packages/rum/src/domain/segmentCollection/` (~430 lines)
- Privacy: `packages/rum-core/src/domain/privacy.ts` + `privacyConstants.ts` (~400 lines)
- Types: `packages/rum/src/types/sessionReplay.ts` (~1,014 lines)

---

### Task 1: Scaffold browser-replay-next package

Create the package structure with build tooling but no implementation yet.

**Files:**
- Create: `packages/browser-replay-next/package.json`
- Create: `packages/browser-replay-next/tsdown.config.ts`
- Create: `packages/browser-replay-next/tsconfig.json`
- Create: `packages/browser-replay-next/src/index.ts`
- Create: `packages/browser-replay-next/src/processor/index.ts` (stub)
- Create: `packages/browser-replay-next/src/extension.ts` (stub)

**Step 1: Create package.json**

Follow `browser-rum-next/package.json`. Three entrypoints: default, `/processor`, `/extension`.

```json
{
  "name": "@datadog/browser-replay-next",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./dist/index.mjs", "types": "./dist/index.d.mts" },
    "./processor": { "import": "./dist/processor.mjs", "types": "./dist/processor.d.mts" },
    "./extension": { "import": "./dist/extension.mjs", "types": "./dist/extension.d.mts" }
  },
  "peerDependencies": {
    "@datadog/core-next": "workspace:*"
  },
  "devDependencies": {
    "@datadog/core-next": "workspace:*",
    "tsdown": "latest",
    "typescript": "5.8.3"
  }
}
```

**Step 2: Create tsdown.config.ts**

```typescript
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    processor: 'src/processor/index.ts',
    extension: 'src/extension.ts',
  },
  format: 'esm',
  dts: true,
})
```

**Step 3: Create stub files**

`src/index.ts` — re-exports public types.
`src/processor/index.ts` — stub Module with name `'replay'`, empty init.
`src/extension.ts` — stub extension with key `'replay'`.

**Step 4: Run `yarn install` to register workspace**

**Step 5: Verify build** — `yarn build` in the package directory.

**Step 6: Commit**

```
git commit -m "📦 Scaffold browser-replay-next package"
```

---

### Task 2: Create replay config extension

Define the replay configuration schema and validation.

**Files:**
- Modify: `packages/browser-replay-next/src/extension.ts`
- Create: `packages/browser-replay-next/src/extension.spec.ts`

**Step 1: Implement the extension**

The extension defines the `replay` config key with validation:

```typescript
interface ReplayInitConfig {
  sampleRate?: number
  startRecordingManually?: boolean
  defaultPrivacyLevel?: 'mask' | 'mask-user-input' | 'allow'
}

interface ReplayConfig {
  sampleRate: number
  startRecordingManually: boolean
  defaultPrivacyLevel: 'mask' | 'mask-user-input' | 'allow'
}
```

Follow `packages/browser-rum-next/src/domain/configuration.ts` for the extension pattern. Validate `sampleRate` is 0-100, default to 0. Default `defaultPrivacyLevel` to `'mask'`. Default `startRecordingManually` to `false`.

**Step 2: Write tests**

Test that invalid sampleRate (negative, >100, non-number) returns validation errors. Test defaults are applied.

**Step 3: Run tests, commit**

```
git commit -m "✨ Add replay config extension with sampleRate and privacy settings"
```

---

### Task 3: Port privacy utilities

The serialization code depends on privacy level computation. Port from `@datadog/browser-rum-core`.

**Files:**
- Create: `packages/browser-replay-next/src/domain/privacy.ts`
- Create: `packages/browser-replay-next/src/domain/privacy.spec.ts`

**Step 1: Copy privacy code**

Copy from:
- `packages/rum-core/src/domain/privacy.ts` (~355 lines)
- `packages/rum-core/src/domain/privacyConstants.ts` (~43 lines)

Merge into a single `privacy.ts` file. Remove any imports from `@datadog/browser-rum-core` — these become local functions. The key exports:

- `NodePrivacyLevel` enum
- `PRIVACY_ATTR_NAME`, `PRIVACY_ATTR_VALUE_*` constants
- `getNodePrivacyLevel()`, `getNodeSelfPrivacyLevel()`, `reducePrivacyLevel()`
- `getTextContent()`, `getElementInputValue()`
- DOM traversal helpers: `getParentNode()`, `forEachChildNodes()`, `hasChildNodes()`, `isNodeShadowRoot()`, `isNodeShadowHost()`

**Step 2: Write tests**

Port the privacy-related tests from `packages/rum-core/src/domain/privacy.spec.ts`. Verify privacy level inheritance, per-element overrides, and input masking.

**Step 3: Run tests, commit**

```
git commit -m "✨ Port privacy utilities into browser-replay-next"
```

---

### Task 4: Port session replay types

The wire format types used by serialization, segments, and the intake.

**Files:**
- Create: `packages/browser-replay-next/src/types/sessionReplay.ts`

**Step 1: Copy from `packages/rum/src/types/sessionReplay.ts`**

This is ~1,014 lines of auto-generated type definitions. Copy as-is. These define:
- `BrowserRecord` union (FullSnapshot, IncrementalSnapshot, Meta, Focus, ViewEnd, etc.)
- `SerializedNodeWithId`, `SerializedNode` types
- `BrowserIncrementalData` union (Mutation, MouseMove, Scroll, Input, etc.)
- `BrowserSegmentMetadata`
- `Change` type (compact wire format)
- `IncrementalSource` enum
- `RecordType` enum

Remove any imports from `@datadog/browser-rum-core` or `@datadog/browser-core` — adapt to local types.

**Step 2: Commit**

```
git commit -m "🏷️ Port session replay types into browser-replay-next"
```

---

### Task 5: Port serialization core

The bulk of the port. This is the DOM serialization engine — virtual DOM tree, node serialization, attribute handling, change encoding. All files are tightly coupled so they move together.

**Files:**
- Create: `packages/browser-replay-next/src/domain/record/serialization/` (entire directory)
- Create: `packages/browser-replay-next/src/domain/record/itemIds.ts`
- Create: `packages/browser-replay-next/src/domain/record/recordingScope.ts`
- Create: `packages/browser-replay-next/src/domain/record/elementsScrollPositions.ts`

**Step 1: Port conversions layer**

Copy from `packages/rum/src/domain/record/serialization/conversions/`:
- `vNode.ts` (~417 lines) — virtual DOM node
- `vDocument.ts` — virtual document
- `vStyleSheet.ts` — virtual stylesheet
- `stringTable.ts` (~25 lines) — string interning
- `nodeIdRemapper.ts` — node ID remapping
- `changeConverter.ts` — V1 to Change format
- `changeDecoder.ts` — Change decoding
- `mutationLog.ts` — mutation tracking
- `renderOptions.ts` — rendering config

**Step 2: Port serialization files**

Copy from `packages/rum/src/domain/record/serialization/`:
- `serializeNode.ts` (~229 lines)
- `serializeNodeAsChange.ts` (~242 lines)
- `serializeAttributes.ts` (~194 lines)
- `serializeAttribute.ts` (~55 lines)
- `serializeStyleSheets.ts` (~36 lines)
- `serializeFullSnapshot.ts` (~47 lines)
- `serializeFullSnapshotAsChange.ts` (~33 lines)
- `serializeMutations.ts` (~395 lines)
- `serializeMutationsAsChange.ts` (~298 lines)
- `changeEncoder.ts` (~89 lines)
- `serializationTransaction.ts` (~264 lines)
- `insertionCursor.ts` (~131 lines)
- `serializationUtils.ts` (~103 lines)
- `serialization.types.ts` (~38 lines)
- `serializationStats.ts` (~43 lines)

**Step 3: Port supporting files**

Copy:
- `itemIds.ts` (~97 lines) — ID allocation
- `recordingScope.ts` (~58 lines) — recording state container
- `elementsScrollPositions.ts` (~60 lines) — scroll tracking

**Step 4: Update imports**

Replace all `@datadog/browser-rum-core` imports with local `../privacy` imports.
Replace all `@datadog/browser-core` imports with `@datadog/core-next` equivalents or local implementations.
Replace `LifeCycle` / `RumConfiguration` references with the replay module's config types.

**Step 5: Verify compilation**

Run `yarn typecheck` in the package. Fix any import errors. The goal is zero type errors — the logic is unchanged, only import paths change.

**Step 6: Commit**

```
git commit -m "✨ Port DOM serialization engine into browser-replay-next"
```

---

### Task 6: Port trackers and recorder orchestrator

The DOM event observers and the orchestrator that wires them together.

**Files:**
- Create: `packages/browser-replay-next/src/domain/record/trackers/` (all tracker files)
- Create: `packages/browser-replay-next/src/domain/record/mutationBatch.ts`
- Create: `packages/browser-replay-next/src/domain/record/shadowRootsController.ts`
- Create: `packages/browser-replay-next/src/domain/record/startFullSnapshots.ts`
- Create: `packages/browser-replay-next/src/domain/record/recorder.ts`

**Step 1: Port trackers**

Copy from `packages/rum/src/domain/record/trackers/`:
- `tracker.types.ts` — tracker interface
- `trackMutation.ts` (~74 lines)
- `trackMove.ts` (~100 lines)
- `trackMouseInteraction.ts` (~120 lines)
- `trackScroll.ts` (~100 lines)
- `trackInput.ts` (~110 lines)
- `trackViewportResize.ts` (~80 lines)
- `trackStyleSheet.ts` (~100 lines)
- `trackMediaInteraction.ts` (~120 lines)
- `trackFocus.ts` (~70 lines)
- `trackViewEnd.ts` (~60 lines)
- `trackVisualViewportResize.ts` (~50 lines)

**Step 2: Port supporting files**

Copy:
- `mutationBatch.ts` (~80 lines) — mutation debouncing
- `shadowRootsController.ts` (~170 lines) — shadow DOM
- `startFullSnapshots.ts` (~150 lines) — periodic full snapshots

**Step 3: Create recorder orchestrator**

Adapt `packages/rum/src/domain/record/record.ts` (~90 lines). The v6 version receives `LifeCycle` and `RumConfiguration`. The v8 version receives the replay config and a callback for emitting records. No pipeline dependency — the recorder is internal to the module.

```typescript
interface RecorderOptions {
  document: Document
  configuration: ReplayConfig
  emitRecord: (record: BrowserRecord) => void
}

function startRecorder(options: RecorderOptions): { stop: () => void; flushMutations: () => void }
```

**Step 4: Update imports, verify compilation**

Same import fixup as Task 5.

**Step 5: Commit**

```
git commit -m "✨ Port trackers and recorder orchestrator into browser-replay-next"
```

---

### Task 7: Implement segment collection

New code. Batches records from the recorder, compresses them, and publishes `observation:replay` to the pipeline.

**Files:**
- Create: `packages/browser-replay-next/src/domain/segmentCollection.ts`
- Create: `packages/browser-replay-next/src/domain/segmentCollection.spec.ts`

**Step 1: Write tests**

```typescript
describe('SegmentCollection', () => {
  it('publishes observation:replay when duration limit is reached', async () => { ... })
  it('publishes observation:replay when size limit is reached', async () => { ... })
  it('publishes observation:replay on view change', async () => { ... })
  it('includes segment metadata (creation_reason, records_count, has_full_snapshot)', async () => { ... })
  it('does not publish when no records have been added', () => { ... })
  it('resets segment index on view change', () => { ... })
})
```

**Step 2: Implement**

The segment collector:
- Receives records via `addRecord(record)`
- Tracks current segment state (records array, byte count, start time, has_full_snapshot)
- Flushes when: size > 60KB, duration > 5s, or explicitly triggered
- On flush: publishes `observation:replay` to the pipeline with the records array and metadata

```typescript
interface SegmentCollectionOptions {
  pipeline: Pipeline<Record<string, unknown>>
}

function startSegmentCollection(options: SegmentCollectionOptions): {
  addRecord: (record: BrowserRecord) => void
  flush: (reason: string) => void
  stop: () => void
}
```

The segment payload published to the pipeline:

```typescript
{
  type: 'replay',
  segment: {
    records: BrowserRecord[],
    creation_reason: string,
    records_count: number,
    has_full_snapshot: boolean,
    index_in_view: number,
    start: number,
    end: number,
  }
}
```

The enricher chain adds `session.id`, `view.id`, `application.id`, tags — same as any other observation.

**Step 3: Run tests, commit**

```
git commit -m "✨ Add segment collection with pipeline integration"
```

---

### Task 8: Wire module entry point

Connect recorder + segment collection + config in the Module init function.

**Files:**
- Modify: `packages/browser-replay-next/src/processor/index.ts`
- Create: `packages/browser-replay-next/src/processor/index.spec.ts`

**Step 1: Implement module init**

```typescript
const replayProcessor: Module = {
  name: 'replay',
  extension: replayExtension,
  init(context: ModuleContext): ReplayPublicApi {
    const config = (context.config as any).replay as ReplayConfig

    // Sampling decision
    const isRecording = shouldRecord(config.sampleRate)

    // Segment collection — publishes observation:replay to pipeline
    const segments = startSegmentCollection({ pipeline: context.pipeline })

    // Recorder — emits records into segment collection
    let recorder: { stop: () => void; flushMutations: () => void } | undefined

    function startRecording() {
      if (recorder) return
      recorder = startRecorder({
        document,
        configuration: config,
        emitRecord: (record) => segments.addRecord(record),
      })
    }

    function stopRecording() {
      if (!recorder) return
      segments.flush('stop')
      recorder.stop()
      recorder = undefined
    }

    // Subscribe to view changes — flush segment on view change
    context.pipeline.subscribe('signal:view_changed', () => {
      segments.flush('view_change')
    })

    // Subscribe to session expiry — stop recording
    context.session.on('expired', () => {
      stopRecording()
    })

    // Route segments to replay track
    context.transport.route('observation:replay', 'replay')

    // Auto-start if not manual
    if (!config.startRecordingManually && isRecording) {
      startRecording()
    }

    return {
      startSessionReplayRecording(options?: { force?: boolean }) {
        if (options?.force || isRecording) {
          startRecording()
        }
      },
      stopSessionReplayRecording() {
        stopRecording()
      },
      __stop() {
        stopRecording()
        segments.stop()
      },
    }
  },
}
```

**Step 2: Write tests**

Test the module lifecycle:
- Auto-start when `startRecordingManually: false` and sample rate allows
- No auto-start when `startRecordingManually: true`
- Manual start/stop via public API
- Segment flush on view change signal
- Stop on session expiry
- `force: true` bypasses sampling

**Step 3: Run tests, commit**

```
git commit -m "🔌 Wire replay module entry point with recorder and segment collection"
```

---

### Task 9: Register replay extension in sdk.ts

Wire the replay module into the SDK so it's discoverable via config.

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts`
- Modify: `packages/browser-sdk/package.json`

**Step 1: Add browser-replay-next dependency**

Add `"@datadog/browser-replay-next": "workspace:*"` to `packages/browser-sdk/package.json` devDependencies and peerDependencies.

**Step 2: Register replay extension**

In `sdk.ts`, import the replay extension and add it to `bundledExtensions`:

```typescript
import { replayExtension } from '@datadog/browser-replay-next/extension'

const bundledExtensions = [logsExtension, rumExtension, replayExtension]
```

This ensures the `replay` config key is validated even before the replay processor is loaded.

**Step 3: Verify `resolveModule` picks up replay**

When `init({ replay: { sampleRate: 100 } })` is called, the SDK should detect the `replay` key, call `resolveModule('replay')`, and load the replay processor.

**Step 4: Run `yarn install`, verify build, commit**

```
git commit -m "🔌 Register replay extension in SDK bundled extensions"
```

---

### Task 10: Integration tests

End-to-end test: SDK with replay module, verify segments reach the replay transport.

**Files:**
- Create: `packages/browser-sdk/src/integration/replay.spec.ts`

**Step 1: Write integration tests**

```typescript
describe('Replay integration', () => {
  it('publishes observation:replay with segment data', async () => { ... })
  it('segment includes session and view context after enrichment', async () => { ... })
  it('does not record when sampleRate is 0', async () => { ... })
  it('manual start/stop controls recording', async () => { ... })
  it('flushes segment on view change', async () => { ... })
  it('stops recording on session expiry', async () => { ... })
  it('replay events reach the replay transport, not rum or logs', async () => { ... })
})
```

**Step 2: Run all tests**

Run: `yarn test:unit` to verify no regressions across all packages.

**Step 3: Commit**

```
git commit -m "✅ Add Session Replay integration tests"
```

---

## Summary

| Task | Description | Lines | Depends on |
|------|-------------|-------|------------|
| 1 | Scaffold browser-replay-next | ~50 new | — |
| 2 | Replay config extension | ~100 new | 1 |
| 3 | Port privacy utilities | ~400 port | 1 |
| 4 | Port session replay types | ~1,014 port | 1 |
| 5 | Port serialization core | ~5,530 port | 3, 4 |
| 6 | Port trackers + recorder | ~1,000 port | 5 |
| 7 | Segment collection (new) | ~200 new | 1 |
| 8 | Wire module entry point | ~150 new | 2, 6, 7 |
| 9 | Register in sdk.ts | ~10 modify | 2 |
| 10 | Integration tests | ~200 new | 8, 9 |

Tasks 1 is the starting point. Tasks 2, 3, 4, 7 can proceed in parallel after 1. Task 5 needs 3 + 4. Task 6 needs 5. Task 8 brings it all together. Task 10 is the final checkpoint.

Total: ~6,950 lines ported, ~710 lines new code.
